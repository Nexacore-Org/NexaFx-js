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
