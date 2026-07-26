/**
 * Deposit flow e2e test — issue #758
 *
 * Exercises the full deposit chain: TransactionsService.createDeposit →
 * WalletsService.adjustBalance → balance update → event emission → audit log.
 *
 * Uses mocked repositories (no real DB required) so no SQLite/enum incompatibility.
 * StellarService is represented by WalletsService.adjustBalance, which is spied on
 * for the failure-path test.
 */
import { TransactionsService, DepositDto } from '../../src/transactions/transactions.service';
import { Transaction, TransactionStatus } from '../../src/transactions/transaction.entity';
import { WalletsService } from '../../src/wallet/wallets.service';
import { AuditService } from '../../src/audit/audit.service';
import { MailService } from '../../src/mail/mail.service';
import { UsersService } from '../../src/users/users.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, Repository } from 'typeorm';

const USER_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

const makeTx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: 'tx-deposit-1',
    senderId: USER_ID,
    receiverId: USER_ID,
    amount: 0,
    currency: 'USD',
    fee: 0,
    reference: 'dep-1',
    status: TransactionStatus.PENDING,
    retryCount: 0,
    metadata: {},
    createdAt: new Date(),
    completedAt: null,
    reversedAt: null,
    reversedBy: null,
    reversalReason: null,
    reversalTransactionId: null,
    deletedAt: null,
    txHash: null,
    pendingTimeoutAt: null,
    ...overrides,
  } as Transaction);

describe('Deposit flow (e2e)', () => {
  let txRepo: jest.Mocked<Pick<Repository<Transaction>, 'create' | 'save' | 'findOne'>>;
  let walletsService: jest.Mocked<Pick<WalletsService, 'adjustBalance' | 'getBalance'>>;
  let auditService: jest.Mocked<Pick<AuditService, 'log'>>;
  let events: jest.Mocked<Pick<EventEmitter2, 'emit'>>;
  let service: TransactionsService;

  beforeEach(() => {
    txRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    walletsService = {
      adjustBalance: jest.fn(),
      getBalance: jest.fn(),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn() };

    service = new TransactionsService(
      txRepo as unknown as Repository<Transaction>,
      {} as DataSource,
      walletsService as unknown as WalletsService,
      auditService as unknown as AuditService,
      { sendTransactionReversalNotice: jest.fn() } as unknown as MailService,
      { findById: jest.fn() } as unknown as UsersService,
      events as unknown as EventEmitter2,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ---------------------------------------------------------------------------
  // Happy path: deposit → COMPLETED, balance credited, event emitted
  // ---------------------------------------------------------------------------

  it('happy path: PENDING → COMPLETED, balance credited, event emitted', async () => {
    const dto: DepositDto = { userId: USER_ID, amount: 250, currency: 'USD', reference: 'dep-happy-1' };
    const tx = makeTx({ amount: dto.amount, reference: dto.reference });

    txRepo.create.mockReturnValue(tx);
    txRepo.save.mockResolvedValue({ ...tx, status: TransactionStatus.COMPLETED });
    walletsService.adjustBalance.mockResolvedValue({
      accountId: USER_ID, currency: 'USD', balance: 250,
    } as any);

    const result = await service.createDeposit(dto);

    // Balance credited
    expect(walletsService.adjustBalance).toHaveBeenCalledWith(USER_ID, 'USD', 250);
    // Status is COMPLETED
    expect(result.status).toBe(TransactionStatus.COMPLETED);
    // Event dispatched
    expect(events.emit).toHaveBeenCalledWith(
      'transactions.deposit.completed',
      expect.objectContaining({ userId: USER_ID }),
    );
    // No audit log on success
    expect(auditService.log).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Failure path: Stellar error → FAILED, balance NOT credited, audit log written
  // ---------------------------------------------------------------------------

  it('failure path: Stellar error → FAILED status, balance NOT credited, audit logged', async () => {
    const dto: DepositDto = { userId: USER_ID, amount: 100, currency: 'EUR', reference: 'dep-fail-1' };
    const tx = makeTx({ amount: dto.amount, currency: 'EUR', reference: dto.reference });

    txRepo.create.mockReturnValue(tx);
    txRepo.save.mockResolvedValue(tx);
    // Stellar submission fails
    walletsService.adjustBalance.mockRejectedValue(new Error('Stellar network timeout'));

    await expect(service.createDeposit(dto)).rejects.toThrow('Stellar network timeout');

    // adjustBalance called once (credit attempt), NOT a second time for rollback
    expect(walletsService.adjustBalance).toHaveBeenCalledTimes(1);

    // Status set to FAILED
    expect(tx.status).toBe(TransactionStatus.FAILED);

    // Audit log written for the failure
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'transaction.deposit.failed' }),
    );

    // No success event
    expect(events.emit).not.toHaveBeenCalled();
  });
});
