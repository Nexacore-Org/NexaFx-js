import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ExchangeRateService } from '../fx/exchange-rate.service';
import { FeesService } from '../fees/fees.service';
import { LedgerEntry } from '../ledger/ledger-entry.entity';
import { LedgerService } from '../ledger/ledger.service';
import { MailService } from '../mail/mail.service';
import { UserDeactivationService } from '../modules/user-deactivation/services/user-deactivation.service';
import { StellarService } from '../stellar/stellar.service';
import { TermsAcceptanceService } from '../terms/terms-acceptance.service';
import { TestDatabaseModule } from '../test/test-database.module';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { WalletBalanceEntity } from '../wallet/wallet-balance.entity';
import { WalletsService } from '../wallet/wallets.service';
import { Transaction, TransactionStatus } from './transaction.entity';
import { TransactionLimitService } from './transaction-limit.service';
import { TransactionsService } from './transactions.service';

describe('TransactionsService (Postgres integration)', () => {
  let module: TestingModule;
  let service: TransactionsService;
  let wallets: WalletsService;
  let dataSource: DataSource;
  let txRepo: Repository<Transaction>;
  let userRepo: Repository<User>;
  let ledgerRepo: Repository<LedgerEntry>;

  const createUser = async (prefix: string): Promise<User> =>
    userRepo.save(
      userRepo.create({
        email: `${prefix}-${randomUUID().slice(0, 8)}@example.com`,
        passwordHash: 'integration-hash',
        firstName: 'Integration',
        lastName: 'User',
      }),
    );

  const fund = (userId: string, amount: number) =>
    wallets.adjustBalance(userId, 'USD', amount);

  const pendingDeposit = async (userId: string, amount: number) =>
    txRepo.save(
      txRepo.create({
        senderId: userId,
        receiverId: userId,
        amount,
        currency: 'USD',
        fee: 0,
        reference: `dep_${randomUUID()}`,
        status: TransactionStatus.PENDING,
        metadata: { type: 'deposit' },
        pendingTimeoutAt: new Date(Date.now() + 60_000),
      }),
    );

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TestDatabaseModule,
        TypeOrmModule.forFeature([
          Transaction,
          User,
          WalletBalanceEntity,
          LedgerEntry,
        ]),
      ],
      providers: [
        WalletsService,
        LedgerService,
        TransactionsService,
        EventEmitter2,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'STELLAR_HOT_WALLET_SECRET' ? 'integration-secret' : 30,
            ),
          },
        },
        { provide: StellarService, useValue: {} },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: MailService,
          useValue: { sendTransactionReversalNotice: jest.fn() },
        },
        {
          provide: UsersService,
          useFactory: (repo: Repository<User>) => ({
            findByIdOrNull: (id: string) => repo.findOne({ where: { id } }),
            findById: async (id: string) => {
              const user = await repo.findOne({ where: { id } });
              if (!user) throw new Error(`User ${id} not found`);
              return user;
            },
            invalidateWalletBalanceCache: jest.fn(),
          }),
          inject: [getRepositoryToken(User)],
        },
        {
          provide: TransactionLimitService,
          useValue: {
            check: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FeesService,
          useValue: {
            calculateFee: jest
              .fn()
              .mockReturnValue({ feeAmount: 0, reason: 'test' }),
            recordFee: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ExchangeRateService, useValue: { getRate: jest.fn() } },
        {
          provide: UserDeactivationService,
          useValue: { isUserDeactivated: jest.fn().mockResolvedValue(false) },
        },
        {
          provide: TermsAcceptanceService,
          useValue: { ensureAccepted: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(TransactionsService);
    wallets = module.get(WalletsService);
    dataSource = module.get(DataSource);
    txRepo = module.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    ledgerRepo = module.get<Repository<LedgerEntry>>(
      getRepositoryToken(LedgerEntry),
    );

    await dataSource.query(
      'CREATE SEQUENCE IF NOT EXISTS transaction_receipt_seq START 1',
    );
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE ledger_entries, wallet_balances, transactions, users RESTART IDENTITY CASCADE',
    );
    await dataSource.query(
      "SELECT setval('transaction_receipt_seq', 1, false)",
    );
  });

  it('lets only one of two parallel oversized transfers debit the sender', async () => {
    const sender = await createUser('sender');
    const firstReceiver = await createUser('receiver-one');
    const secondReceiver = await createUser('receiver-two');
    await fund(sender.id, 100);

    const results = await Promise.allSettled([
      service.transfer({
        senderId: sender.id,
        receiverId: firstReceiver.id,
        amount: 60,
        currency: 'USD',
        reference: `race_${randomUUID()}`,
      }),
      service.transfer({
        senderId: sender.id,
        receiverId: secondReceiver.id,
        amount: 60,
        currency: 'USD',
        reference: `race_${randomUUID()}`,
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);

    const balance = await wallets.getBalance(sender.id, 'USD');
    expect(balance.balance).toBeGreaterThanOrEqual(0);
    expect(balance.balance).toBe(40);

    const receiverTotal =
      (await wallets.getBalance(firstReceiver.id, 'USD')).balance +
      (await wallets.getBalance(secondReceiver.id, 'USD')).balance;
    expect(receiverTotal).toBe(60);

    const rows = await txRepo.find({ where: { senderId: sender.id } });
    expect(
      rows.filter((row) => row.status === TransactionStatus.COMPLETED),
    ).toHaveLength(1);
    expect(
      rows.filter((row) => row.status === TransactionStatus.PENDING),
    ).toHaveLength(0);
  });

  it('reverses a completed transfer only once under parallel calls', async () => {
    const sender = await createUser('reverse-sender');
    const receiver = await createUser('reverse-receiver');
    await fund(sender.id, 100);

    const transfer = await service.transfer({
      senderId: sender.id,
      receiverId: receiver.id,
      amount: 20,
      currency: 'USD',
      reference: `reverse_${randomUUID()}`,
    });

    const results = await Promise.allSettled([
      service.reverseTransaction(transfer.id, {
        reversedBy: sender.id,
        reason: 'race',
      }),
      service.reverseTransaction(transfer.id, {
        reversedBy: sender.id,
        reason: 'race',
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);

    const reversed = await txRepo.findOneOrFail({ where: { id: transfer.id } });
    expect(reversed.status).toBe(TransactionStatus.REVERSED);
    expect(reversed.reversedAt).not.toBeNull();
    expect(
      await txRepo.count({
        where: { reference: `${transfer.reference}-reversal` },
      }),
    ).toBe(1);

    expect((await wallets.getBalance(sender.id, 'USD')).balance).toBe(100);
    expect((await wallets.getBalance(receiver.id, 'USD')).balance).toBe(0);
  });

  it('credits a deposit only once under parallel confirmDeposit calls', async () => {
    const user = await createUser('depositor');
    const deposit = await pendingDeposit(user.id, 50);

    const results = await Promise.allSettled([
      service.confirmDeposit(user.id, deposit.id, 'race-hash'),
      service.confirmDeposit(user.id, deposit.id, 'race-hash'),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);

    const confirmed = await txRepo.findOneOrFail({ where: { id: deposit.id } });
    expect(confirmed.status).toBe(TransactionStatus.COMPLETED);
    expect((await wallets.getBalance(user.id, 'USD')).balance).toBe(50);
    expect(
      await ledgerRepo.count({
        where: { userId: user.id, transactionId: deposit.id },
      }),
    ).toBe(1);
  });

  it('leaves no PENDING row when the receiver does not exist', async () => {
    const sender = await createUser('sender-missing');
    await fund(sender.id, 100);
    const missingReceiverId = randomUUID();

    await expect(
      service.transfer({
        senderId: sender.id,
        receiverId: missingReceiverId,
        amount: 10,
        currency: 'USD',
        reference: `missing_${randomUUID()}`,
      }),
    ).rejects.toThrow('Receiver not found');

    expect(
      await txRepo.find({ where: { receiverId: missingReceiverId } }),
    ).toHaveLength(0);
    expect(
      await txRepo.find({ where: { status: TransactionStatus.PENDING } }),
    ).toHaveLength(0);
    expect((await wallets.getBalance(sender.id, 'USD')).balance).toBe(100);
  });
});
