import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { ExchangeRateService } from './exchange-rate.service';
import { FxService } from './fx.service';
import { FxTrade } from './fx-trade.entity';
import { CurrencyPair } from './currency-pair.entity';
import { LedgerEntry } from '../ledger/ledger-entry.entity';
import { LedgerService } from '../ledger/ledger.service';
import { AccountFreezeService } from '../modules/account-freeze/services/account-freeze.service';
import { TestDatabaseModule } from '../test/test-database.module';
import { WalletBalanceEntity } from '../wallet/wallet-balance.entity';
import { WalletsService } from '../wallet/wallets.service';
import { UsersService } from '../users/users.service';

describe('FxService (Postgres integration)', () => {
  let module: TestingModule;
  let fx: FxService;
  let wallets: WalletsService;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TestDatabaseModule,
        TypeOrmModule.forFeature([
          FxTrade,
          CurrencyPair,
          WalletBalanceEntity,
          LedgerEntry,
        ]),
      ],
      providers: [
        FxService,
        WalletsService,
        LedgerService,
        {
          provide: ExchangeRateService,
          useValue: {
            getRate: jest.fn().mockResolvedValue({ rate: 2, provider: 'test' }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, fallback?: unknown) => fallback ?? 5),
          },
        },
        {
          provide: AccountFreezeService,
          useValue: { assertNotFrozen: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: UsersService, useValue: { findById: jest.fn() } },
      ],
    }).compile();

    fx = module.get(FxService);
    wallets = module.get(WalletsService);
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE ledger_entries, wallet_balances, fx_trades, currency_pairs CASCADE',
    );
  });

  it('executes an FX trade with real wallet/ledger updates', async () => {
    const userId = randomUUID();
    await wallets.adjustBalance(userId, 'USD', 100);

    const trade = await fx.executeTrade({
      userId,
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      fromAmount: 10,
    });

    expect(trade.toAmount).toBe(20);
    expect((await wallets.getBalance(userId, 'USD')).balance).toBe(90);
    expect((await wallets.getBalance(userId, 'EUR')).balance).toBe(20);
  });

  it('reverses a trade only once under parallel reverseTrade calls', async () => {
    const userId = randomUUID();
    await wallets.adjustBalance(userId, 'USD', 100);

    const trade = await fx.executeTrade({
      userId,
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      fromAmount: 10,
    });

    const results = await Promise.allSettled([
      fx.reverseTrade(trade.id, userId),
      fx.reverseTrade(trade.id, userId),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);

    const stored = await dataSource.getRepository(FxTrade).findOneOrFail({
      where: { id: trade.id },
    });
    expect(stored.reversedAt).not.toBeNull();
    expect((await wallets.getBalance(userId, 'USD')).balance).toBe(100);
    expect((await wallets.getBalance(userId, 'EUR')).balance).toBe(0);
  });
});
