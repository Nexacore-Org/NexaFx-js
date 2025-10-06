import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FraudDetectionService,
  FraudFactorType,
} from './fraud-detection.service';
import { Dispute, DisputeState } from '../entities/dispute.entity';
import { Transaction } from '../entities/transaction.entity';
import { User } from '../entities/user.entity';
import { disputeConfig } from '../config/dispute.config';

describe('FraudDetectionService', () => {
  let service: FraudDetectionService;
  let disputeRepository: jest.Mocked<Repository<Dispute>>;
  let transactionRepository: jest.Mocked<Repository<Transaction>>;
  let userRepository: jest.Mocked<Repository<User>>;

  const mockDisputeRepository = {
    count: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockTransactionRepository = {
    findOne: jest.fn(),
    count: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FraudDetectionService,
        {
          provide: getRepositoryToken(Dispute),
          useValue: mockDisputeRepository,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<FraudDetectionService>(FraudDetectionService);
    disputeRepository = module.get(getRepositoryToken(Dispute));
    transactionRepository = module.get(getRepositoryToken(Transaction));
    userRepository = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeDispute', () => {
    it('should return structured factors with enum types', async () => {
      // Mock dispute data
      const mockTransaction = {
        id: 'tx-1',
        amountNaira: '100000',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        userId: 'user-1',
      } as Transaction;

      const mockDispute = {
        id: 'dispute-1',
        userId: 'user-1',
        transactionId: 'tx-1',
        amountNaira: '100000',
        createdAt: new Date('2024-01-01T11:00:00Z'), // 1 hour after transaction
        transaction: mockTransaction,
      } as Dispute;

      // Mock repository responses
      disputeRepository.count.mockResolvedValue(0); // No recent disputes
      disputeRepository.find.mockResolvedValue([]); // No duplicate disputes
      transactionRepository.findOne.mockResolvedValue(mockTransaction);

      const result = await service.analyzeDispute(mockDispute);

      expect(result).toBeDefined();
      expect(result.factors).toBeInstanceOf(Array);
      expect(result.factors.length).toBeGreaterThan(0);

      // Check that factors are structured objects with enum types
      result.factors.forEach((factor) => {
        expect(factor).toHaveProperty('type');
        expect(factor).toHaveProperty('description');
        expect(factor).toHaveProperty('score');
        expect(Object.values(FraudFactorType)).toContain(factor.type);
      });

      // Check that timing factors are properly typed
      const timingFactors = result.factors.filter(
        (f) => f.type === FraudFactorType.TIMING,
      );
      expect(timingFactors.length).toBeGreaterThan(0);
      expect(timingFactors[0].description).toContain('within 1 hour');
    });

    it('should generate recommendations based on factor types', async () => {
      // Mock dispute with duplicate and amount factors
      const mockTransaction = {
        id: 'tx-1',
        amountNaira: '600000', // Large amount
        createdAt: new Date('2024-01-01T10:00:00Z'),
        userId: 'user-1',
      } as Transaction;

      const mockDispute = {
        id: 'dispute-1',
        userId: 'user-1',
        transactionId: 'tx-1',
        amountNaira: 600000,
        createdAt: new Date('2024-01-01T11:00:00Z'),
        transaction: mockTransaction,
      } as Dispute;

      // Mock duplicate disputes
      const mockDuplicateDisputes = [
        {
          id: 'dispute-2',
          transactionId: 'tx-1',
        },
      ] as Dispute[];

      disputeRepository.count.mockResolvedValue(0); // No recent disputes
      disputeRepository.find
        .mockResolvedValueOnce(mockDuplicateDisputes) // Duplicate check
        .mockResolvedValueOnce([]); // User dispute history
      transactionRepository.findOne.mockResolvedValue(mockTransaction);

      const result = await service.analyzeDispute(mockDispute);

      expect(result.recommendations).toContain('Verify transaction uniqueness'); // From DUPLICATE factor
      expect(result.recommendations).toContain(
        'Verify transaction amount and purpose',
      ); // From AMOUNT factor
    });
  });
});
