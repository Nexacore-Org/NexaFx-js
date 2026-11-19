import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { TestDatabaseModule } from '../test/test-database.module';
import { LedgerEntry } from '../ledger/ledger-entry.entity';
import { LedgerService } from '../ledger/ledger.service';
import { UsersService } from '../users/users.service';
import { WalletBalanceEntity } from './wallet-balance.entity';
import { WalletsService } from './wallets.service';

describe('WalletsService (Postgres integration)', () => {
  let module: TestingModule;
  let wallets: WalletsService;
  let dataSource: DataSource;
  let walletRepo: Repository<WalletBalanceEntity>;
  let ledgerRepo: Repository<LedgerEntry>;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TestDatabaseModule,
        TypeOrmModule.forFeature([WalletBalanceEntity, LedgerEntry]),
      ],
      providers: [
        WalletsService,
        LedgerService,
        { provide: UsersService, useValue: { findById: jest.fn() } },
      ],
    }).compile();

    wallets = module.get(WalletsService);
    dataSource = module.get(DataSource);
    walletRepo = module.get<Repository<WalletBalanceEntity>>(
      getRepositoryToken(WalletBalanceEntity),
    );
    ledgerRepo = module.get<Repository<LedgerEntry>>(
      getRepositoryToken(LedgerEntry),
    );
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE ledger_entries, wallet_balances CASCADE',
    );
  });

  it('serialises 20 parallel first credits to exactly 20 in one wallet row', async () => {
    const accountId = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        wallets.adjustBalance(accountId, 'USD', 1),
      ),
    );

    expect(results).toHaveLength(20);
    const balance = await wallets.getBalance(accountId, 'USD');
    expect(balance.balance).toBe(20);

    const rows = await walletRepo.find({
      where: { accountId, currency: 'USD' },
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.balance)).toBe(20);

    expect(await ledgerRepo.count({ where: { userId: accountId } })).toBe(20);
  });
});
