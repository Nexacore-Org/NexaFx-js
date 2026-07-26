import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WalletBalanceEntity } from './wallet-balance.entity';
import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  let service: WalletsService;
  let mockManager: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let mockRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let mockQueryRunner: {
    manager: typeof mockManager;
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    isTransactionActive: boolean;
  };
  let mockDataSource: {
    createQueryRunner: jest.Mock;
  };

  beforeEach(async () => {
    mockManager = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    mockQueryRunner = {
      manager: mockManager,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true,
    };

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        {
          provide: getRepositoryToken(WalletBalanceEntity),
          useValue: mockRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('adjustBalance', () => {
    it('creates a new wallet if it does not exist and returns the updated balance', async () => {
      mockManager.findOne.mockResolvedValue(null);
      mockManager.create.mockImplementation(
        (_entity: unknown, data: Record<string, unknown>) => data,
      );
      mockManager.save.mockImplementation((data: Record<string, unknown>) => ({
        ...data,
        id: 'new-id',
      }));

      const result = await service.adjustBalance('account-1', 'usd', 100);

      expect(result.balance).toBe(100);
      expect(result.accountId).toBe('account-1');
      expect(result.currency).toBe('USD');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    });

    it('updates an existing wallet balance', async () => {
      const existingWallet = {
        accountId: 'account-1',
        currency: 'USD',
        balance: 50,
      };
      mockManager.findOne.mockResolvedValue(existingWallet);
      mockManager.save.mockImplementation((data: Record<string, unknown>) => ({
        ...data,
        id: 'existing-id',
      }));

      const result = await service.adjustBalance('account-1', 'USD', 50);

      expect(result.balance).toBe(100);
    });

    it('rejects unsupported currencies', async () => {
      await expect(
        service.adjustBalance('account-1', 'btc', 50),
      ).rejects.toThrow('Unsupported currency');
    });

    it('throws an error for insufficient balance', async () => {
      mockManager.findOne.mockResolvedValue({
        accountId: 'account-1',
        currency: 'USD',
        balance: 10,
      });

      await expect(
        service.adjustBalance('account-1', 'USD', -50),
      ).rejects.toThrow('Insufficient balance');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBalance', () => {
    it('returns an existing wallet balance', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: 'id-1',
        accountId: 'account-1',
        currency: 'USD',
        balance: 250.5,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getBalance('account-1', 'usd');

      expect(result.balance).toBe(250.5);
      expect(result.accountId).toBe('account-1');
      expect(result.currency).toBe('USD');
    });

    it('rejects unsupported currencies when fetching a balance', async () => {
      await expect(service.getBalance('account-1', 'aud')).rejects.toThrow(
        'Unsupported currency',
      );
    });

    it('returns a zero balance for a missing wallet', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getBalance('account-1', 'EUR');

      expect(result.balance).toBe(0);
      expect(result.accountId).toBe('account-1');
      expect(result.currency).toBe('EUR');
    });
  });

  describe('getBalancesForAccount', () => {
    it('returns all balances for an account', async () => {
      mockRepository.find.mockResolvedValue([
        {
          id: '1',
          accountId: 'account-1',
          currency: 'USD',
          balance: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          accountId: 'account-1',
          currency: 'EUR',
          balance: 200,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.getBalancesForAccount('account-1');

      expect(result).toHaveLength(2);
      expect(result[0]!.currency).toBe('USD');
      expect(result[1]!.currency).toBe('EUR');
    });

    it('should return empty array for account with no balances', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.getBalancesForAccount('account-new');

      expect(result).toHaveLength(0);
    });
  });

  // ── Financial arithmetic edge cases ────────────────────────────────────────

  describe('adjustBalance – financial arithmetic', () => {
    // Helper: configure the transaction manager as if the DB holds `existing`.
    // null means no row exists yet. save echoes back whatever it receives.
    function setupWallet(existing: Partial<WalletBalanceEntity> | null) {
      mockManager.findOne.mockResolvedValue(existing);
      mockManager.create.mockImplementation(
        (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
      );
      mockManager.save.mockImplementation(
        async (data: Record<string, unknown>) => ({ ...data, id: 'w-1' }),
      );
    }

    it('initial balance is 0 for a brand-new account (getBalance returns 0 when no row exists)', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getBalance('acct-new', 'USD');

      expect(result.balance).toBe(0);
      expect(result.accountId).toBe('acct-new');
      expect(result.currency).toBe('USD');
    });

    it('positive delta increases balance from zero', async () => {
      setupWallet(null); // no existing row → wallet starts at 0

      const result = await service.adjustBalance('acct-1', 'USD', 150);

      expect(result.balance).toBe(150);
      expect(result.accountId).toBe('acct-1');
      expect(result.currency).toBe('USD');
    });

    it('negative delta decreases an existing balance', async () => {
      setupWallet({ accountId: 'acct-1', currency: 'USD', balance: 200 });

      const result = await service.adjustBalance('acct-1', 'USD', -75);

      expect(result.balance).toBe(125);
    });

    it('balance reaches exactly zero without throwing', async () => {
      setupWallet({ accountId: 'acct-1', currency: 'USD', balance: 50 });

      const result = await service.adjustBalance('acct-1', 'USD', -50);

      expect(result.balance).toBe(0);
    });

    it('throws BadRequestException when delta would make balance negative', async () => {
      setupWallet({ accountId: 'acct-1', currency: 'USD', balance: 30 });

      await expect(
        service.adjustBalance('acct-1', 'USD', -30.01),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.adjustBalance('acct-1', 'USD', -30.01),
      ).rejects.toThrow('Insufficient balance');
    });

    it('rounds result to 2 decimal places (0.1 + 0.2 floating-point case)', async () => {
      // Without rounding, 0.1 + 0.2 === 0.30000000000000004 in IEEE 754
      setupWallet({ accountId: 'acct-fp', currency: 'USD', balance: 0.1 });

      const result = await service.adjustBalance('acct-fp', 'USD', 0.2);

      expect(result.balance).toBe(0.3);
      expect(result.balance.toString()).toBe('0.3');
    });

    it('rounds a multi-decimal delta to 2 decimal places', async () => {
      setupWallet({ accountId: 'acct-fp', currency: 'USD', balance: 1.005 });

      const result = await service.adjustBalance('acct-fp', 'USD', 1.005);

      // 1.005 + 1.005 = 2.01 after toFixed(2) rounding
      expect(result.balance).toBe(2.01);
    });

    it('delta === 0 returns current balance without opening a DB transaction', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: 'w-1',
        accountId: 'acct-1',
        currency: 'USD',
        balance: 99,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.adjustBalance('acct-1', 'USD', 0);

      expect(result.balance).toBe(99);
      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
    });
  });

  // ── Multi-currency isolation ───────────────────────────────────────────────

  describe('multi-currency isolation', () => {
    it('USD and EUR balances are stored and retrieved independently', async () => {
      mockRepository.findOne.mockImplementation(
        (opts: { where: { accountId: string; currency: string } }) => {
          const { currency } = opts.where;
          if (currency === 'USD') {
            return Promise.resolve({
              id: 'w-usd',
              accountId: 'acct-multi',
              currency: 'USD',
              balance: 500,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          if (currency === 'EUR') {
            return Promise.resolve({
              id: 'w-eur',
              accountId: 'acct-multi',
              currency: 'EUR',
              balance: 300,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          return Promise.resolve(null);
        },
      );

      const usd = await service.getBalance('acct-multi', 'USD');
      const eur = await service.getBalance('acct-multi', 'EUR');

      expect(usd.balance).toBe(500);
      expect(eur.balance).toBe(300);
      expect(usd.currency).toBe('USD');
      expect(eur.currency).toBe('EUR');
    });

    it('adjusting USD balance does not touch the EUR row', async () => {
      mockManager.findOne.mockResolvedValue({
        accountId: 'acct-multi',
        currency: 'USD',
        balance: 100,
      });
      mockManager.save.mockImplementation(
        async (data: Record<string, unknown>) => ({ ...data, id: 'w-usd' }),
      );

      await service.adjustBalance('acct-multi', 'USD', 50);

      // Every findOne call inside the transaction must have been for USD only
      const queriedCurrencies: string[] = mockManager.findOne.mock.calls.map(
        (args: unknown[]) =>
          (args[1] as { where: { currency: string } }).where.currency,
      );
      expect(queriedCurrencies.every((c) => c === 'USD')).toBe(true);
    });

    it('currency codes are normalised to uppercase before storage', async () => {
      mockManager.findOne.mockResolvedValue(null);
      mockManager.create.mockImplementation(
        (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
      );
      mockManager.save.mockImplementation(
        async (data: Record<string, unknown>) => ({ ...data, id: 'w-1' }),
      );

      const result = await service.adjustBalance('acct-1', 'usd', 100);

      expect(result.currency).toBe('USD');
    });
  });

  // ── getBalancesForAccount – shape and completeness ─────────────────────────

  describe('getBalancesForAccount – shape and completeness', () => {
    it('returns all currencies held by an account', async () => {
      const now = new Date();
      mockRepository.find.mockResolvedValue([
        { id: '1', accountId: 'acct-1', currency: 'USD', balance: 100, createdAt: now, updatedAt: now },
        { id: '2', accountId: 'acct-1', currency: 'EUR', balance: 200, createdAt: now, updatedAt: now },
        { id: '3', accountId: 'acct-1', currency: 'GBP', balance: 50,  createdAt: now, updatedAt: now },
      ]);

      const result = await service.getBalancesForAccount('acct-1');

      expect(result).toHaveLength(3);
      const currencies = result.map((r) => r.currency);
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
      expect(currencies).toContain('GBP');
    });

    it('each entry carries the correct balance for its currency', async () => {
      const now = new Date();
      mockRepository.find.mockResolvedValue([
        { id: '1', accountId: 'acct-1', currency: 'USD', balance: 999, createdAt: now, updatedAt: now },
        { id: '2', accountId: 'acct-1', currency: 'EUR', balance: 1,   createdAt: now, updatedAt: now },
      ]);

      const result = await service.getBalancesForAccount('acct-1');

      const usd = result.find((r) => r.currency === 'USD');
      const eur = result.find((r) => r.currency === 'EUR');
      expect(usd?.balance).toBe(999);
      expect(eur?.balance).toBe(1);
    });

    it('queries the repository with the correct accountId', async () => {
      mockRepository.find.mockResolvedValue([]);

      await service.getBalancesForAccount('acct-xyz');

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { accountId: 'acct-xyz' },
      });
    });
  });
});
