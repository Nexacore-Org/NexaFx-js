import { ActivityFeedService } from '../activity-feed/activity-feed.service';
import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  it('starts balances at zero and normalizes currencies', () => {
    const service = new WalletsService();

import { UnprocessableEntityException } from '@nestjs/common';
import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  let walletsService: WalletsService;

  beforeEach(() => {
    walletsService = new WalletsService();
  });

  it('allows a debit that lands exactly on zero', () => {
    walletsService.adjustBalance('account-1', 'usd', 5);

    expect(walletsService.adjustBalance('account-1', 'usd', -5)).toMatchObject({
      accountId: 'account-1',
      currency: 'usd',
      balance: 0,
    });
  });

  it('rejects a debit that would make the balance negative', () => {
    expect(() =>
      walletsService.adjustBalance('account-1', 'usd', -0.01),
    ).toThrowError(new UnprocessableEntityException('Insufficient funds'));
  });
});
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WalletsService } from './wallets.service';
import { WalletBalanceEntity } from './wallet-balance.entity';

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
    manager: { transaction: jest.Mock };
  };

  beforeEach(async () => {
    mockManager = {
  beforeEach(() => {
    service = new WalletsService();
  });

  it('starts accounts at zero and normalizes currencies', () => {
    expect(service.getBalance('acct-1', 'usd')).toEqual({
      accountId: 'acct-1',
      currency: 'usd',
      balance: 0,
    });
  });

  it('adjusts balances with two-decimal precision', () => {
    const service = new WalletsService();

    expect(service.adjustBalance('acct-1', 'usd', 10.125)).toEqual({
      accountId: 'acct-1',
      currency: 'usd',
      balance: 10.13,
    });

    expect(service.adjustBalance('acct-1', 'usd', -0.03)).toEqual({
      accountId: 'acct-1',
      currency: 'usd',
      balance: 10.1,
    });
  });

  it('returns balances for an account', () => {
    const service = new WalletsService();

    service.adjustBalance('acct-1', 'usd', 5);
    service.adjustBalance('acct-1', 'eur', 4);
    service.adjustBalance('acct-2', 'usd', 8);

    expect(service.getBalancesForAccount('acct-1')).toEqual([
      {
        accountId: 'acct-1',
        currency: 'usd',
        balance: 5,
      },
      {
        accountId: 'acct-1',
        currency: 'eur',
        balance: 4,
      },
    ]);
  });

  it('emits an activity event when a balance changes', () => {
    const recordActivity = jest.fn();
    const activityFeedService = {
      recordActivity,
    } as unknown as ActivityFeedService;
    const service = new WalletsService(activityFeedService);

    service.adjustBalance('acct-1', 'usd', 12.5);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'acct-1',
        type: 'wallet.balance_adjusted',
        securityEvent: false,
      }),
    );
  });
});
  const createMockRepository = () => ({
    manager: {
      transaction: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      manager: {
        transaction: jest.fn(
          (cb: (manager: typeof mockManager) => PromiseLike<unknown>) =>
            cb(mockManager),
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        {
          provide: getRepositoryToken(WalletBalanceEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('adjustBalance', () => {
    it('should create new wallet if not exists and return updated balance', async () => {
      mockManager.findOne.mockResolvedValue(null);
      mockManager.create.mockImplementation(
        (_entity: unknown, data: Record<string, unknown>) => data,
      );
      mockManager.save.mockImplementation((data: Record<string, unknown>) => ({
        ...data,
        id: 'new-id',
      }));

      const result = await service.adjustBalance('account-1', 'USD', 100);

      expect(result.balance).toBe(100);
      expect(result.accountId).toBe('account-1');
      expect(result.currency).toBe('USD');
    });

    it('should update existing wallet balance', async () => {
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

    it('should throw error for insufficient balance', async () => {
      mockManager.findOne.mockResolvedValue({
        accountId: 'account-1',
        currency: 'USD',
        balance: 10,
      });

      await expect(
        service.adjustBalance('account-1', 'USD', -50),
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('getBalance', () => {
    it('should return existing wallet balance', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: 'id-1',
        accountId: 'account-1',
        currency: 'USD',
        balance: 250.5,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getBalance('account-1', 'USD');

      expect(result.balance).toBe(250.5);
      expect(result.accountId).toBe('account-1');
    });

    it('should return zero balance for non-existent wallet', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getBalance('account-1', 'EUR');

      expect(result.balance).toBe(0);
      expect(result.accountId).toBe('account-1');
      expect(result.currency).toBe('EUR');
    });
  });

  describe('getBalancesForAccount', () => {
    it('should return all balances for an account', async () => {
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
      expect(result[0].currency).toBe('USD');
      expect(result[1].currency).toBe('EUR');
    });

    it('should return empty array for account with no balances', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.getBalancesForAccount('account-new');

      expect(result).toHaveLength(0);
    });
  });
});
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('adjustBalance', () => {
    it('should create new wallet if not exists using transaction', async () => {
      mockRepository.manager.transaction.mockImplementation(async (cb) => {
        const txManager = {
          findOne: jest.fn().mockResolvedValueOnce(null),
          update: jest.fn(),
          insert: jest.fn().mockResolvedValueOnce(undefined),
        };
        return cb(txManager);
      });

      const result = await service.adjustBalance('acc-1', 'USD', 100);

      expect(result).toEqual({ accountId: 'acc-1', currency: 'USD', balance: 100 });
      expect(mockRepository.manager.transaction).toHaveBeenCalledTimes(1);
      expect(mockRepository.manager.transaction.mock.calls[0][0]).toHaveLength(1);
    });

    it('should update existing wallet balance using transaction', async () => {
      mockRepository.manager.transaction.mockImplementation(async (cb) => {
        const txManager = {
          findOne: jest.fn().mockResolvedValueOnce({
            accountId: 'acc-1',
            currency: 'USD',
            balance: '50.00000000',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          update: jest.fn().mockResolvedValueOnce(undefined),
          insert: jest.fn(),
        };
        return cb(txManager);
      });

      const result = await service.adjustBalance('acc-1', 'USD', 100);

      expect(result.balance).toBe(150);
      expect(mockRepository.manager.transaction).toHaveBeenCalledTimes(1);
    });

    it('should use separate transactions for concurrent adjustBalance calls (prevents race condition)', async () => {
      mockRepository.manager.transaction.mockImplementation(async (cb) => {
        const txManager = {
          findOne: jest.fn().mockResolvedValueOnce({
            accountId: 'acc-1',
            currency: 'USD',
            balance: '0.00000000',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          update: jest.fn().mockResolvedValueOnce(undefined),
          insert: jest.fn(),
        };
        return cb(txManager);
      });

      await Promise.all([
        service.adjustBalance('acc-1', 'USD', 100),
        service.adjustBalance('acc-1', 'USD', 100),
      ]);

      expect(mockRepository.manager.transaction).toHaveBeenCalledTimes(2);
    });

    it('should use pessimistic_write lock in transaction for atomicity', async () => {
      const capturedOptions: any[] = [];

      mockRepository.manager.transaction.mockImplementation(async (cb) => {
        const txManager = {
          findOne: jest.fn().mockImplementation((entity, options) => {
            capturedOptions.push(options);
            return Promise.resolve({
              accountId: 'acc-1',
              currency: 'USD',
              balance: '0.00000000',
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }),
          update: jest.fn().mockResolvedValueOnce(undefined),
          insert: jest.fn(),
        };
        return cb(txManager);
      });

      await service.adjustBalance('acc-1', 'USD', 100);

      expect(capturedOptions.length).toBeGreaterThan(0);
      expect(capturedOptions[0].lock).toEqual({ mode: 'pessimistic_write' });
    });
  });
});
