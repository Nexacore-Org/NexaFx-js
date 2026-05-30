import { Test, TestingModule } from '@nestjs/testing';
import { WalletsService } from './wallets.service';
import { WalletBalanceEntity } from './wallet-balance.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('WalletsService', () => {
  let service: WalletsService;

  const createMockRepository = () => ({
    manager: {
      transaction: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      insert: jest.fn(),
    },
    findOne: jest.fn(),
    find: jest.fn(),
  });

  let mockRepository: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    mockRepository = createMockRepository();

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