import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
    manager: { transaction: jest.Mock };
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
  });
});
