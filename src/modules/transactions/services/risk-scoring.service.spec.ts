import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskScoringService, RiskScoringConfig } from './risk-scoring.service';
import { TransactionEntity } from '../entities/transaction.entity';
import { TransactionRiskEntity } from '../entities/transaction-risk.entity';
import { RiskLevel, ReviewStatus } from '../dto/risk-evaluation.dto';
import { DeviceEntity } from '../../sessions/entities/device.entity';

// Mock repositories
const mockTransactionRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    select: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getMany: jest.fn(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
  })),
});

const mockRiskRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    select: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
  })),
});

const mockDeviceRepo = () => ({
  findOne: jest.fn(),
});

describe('RiskScoringService', () => {
  let service: RiskScoringService;
  let transactionRepo: jest.Mocked<Repository<TransactionEntity>>;
  let riskRepo: jest.Mocked<Repository<TransactionRiskEntity>>;
  let deviceRepo: jest.Mocked<Repository<DeviceEntity>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskScoringService,
        { provide: getRepositoryToken(TransactionRiskEntity), useFactory: mockRiskRepo },
        { provide: getRepositoryToken(TransactionEntity), useFactory: mockTransactionRepo },
        { provide: getRepositoryToken(DeviceEntity), useFactory: mockDeviceRepo },
      ],
    }).compile();

    service = module.get<RiskScoringService>(RiskScoringService);
    transactionRepo = module.get(getRepositoryToken(TransactionEntity));
    riskRepo = module.get(getRepositoryToken(TransactionRiskEntity));
    deviceRepo = module.get(getRepositoryToken(DeviceEntity));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Fraud Scenario: High-Value Transaction', () => {
    it('should flag high-value transactions above threshold', async () => {
      const transactionId = 'tx-high-value';
      const userId = 'user-1';

      const mockTransaction = {
        id: transactionId,
        amount: 50000, // $50,000 - well above threshold
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      } as TransactionEntity;

      transactionRepo.findOne.mockResolvedValue(mockTransaction);
      riskRepo.findOne.mockResolvedValue(null);
      riskRepo.create.mockReturnValue({
        id: 'risk-id-1',
        transactionId,
        riskScore: 0,
        riskLevel: 'LOW' as RiskLevel,
        isFlagged: false,
        riskFactors: [],
        evaluationHistory: [],
        reviewStatus: 'PENDING_REVIEW' as ReviewStatus,
        autoProcessed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as TransactionRiskEntity);
      riskRepo.save.mockResolvedValue({} as TransactionRiskEntity);
      transactionRepo.save.mockResolvedValue(mockTransaction);
      transactionRepo.find.mockResolvedValue([]);
      transactionRepo.count.mockResolvedValue(0);

      const result = await service.evaluateRisk(transactionId, userId);

      expect(result.isFlagged).toBe(true);
      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.riskFactors.some((f) => f.rule === 'HIGH_VALUE_TRANSACTION')).toBe(true);
    });

    it('should not flag transactions below high-value threshold', async () => {
      const transactionId = 'tx-low-value';
      const userId = 'user-1';

      const mockTransaction = {
        id: transactionId,
        amount: 100, // $100 - below threshold
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      } as TransactionEntity;

      transactionRepo.findOne.mockResolvedValue(mockTransaction);
      riskRepo.findOne.mockResolvedValue(null);
      riskRepo.create.mockReturnValue({
        id: 'risk-id-1',
        transactionId,
        riskScore: 0,
        riskLevel: 'LOW' as RiskLevel,
        isFlagged: false,
        riskFactors: [],
        evaluationHistory: [],
        reviewStatus: 'PENDING_REVIEW' as ReviewStatus,
        autoProcessed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as TransactionRiskEntity);
      riskRepo.save.mockResolvedValue({} as TransactionRiskEntity);
      transactionRepo.save.mockResolvedValue(mockTransaction);
      transactionRepo.find.mockResolvedValue([]);
      transactionRepo.count.mockResolvedValue(0);

      const result = await service.evaluateRisk(transactionId, userId);

      expect(result.riskFactors.some((f) => f.rule === 'HIGH_VALUE_TRANSACTION')).toBe(false);
    });
  });

  describe('Fraud Scenario: Rapid Consecutive Transfers', () => {
    it('should flag when user makes many transactions in short time window', async () => {
      const transactionId = 'tx-rapid';
      const userId = 'user-rapid';

      const mockTransaction = {
        id: transactionId,
        amount: 1000,
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      } as TransactionEntity;

      transactionRepo.findOne.mockResolvedValue(mockTransaction);
      riskRepo.findOne.mockResolvedValue(null);
      riskRepo.create.mockReturnValue({
        id: 'risk-id-1',
        transactionId,
        riskScore: 0,
        riskLevel: 'LOW' as RiskLevel,
        isFlagged: false,
        riskFactors: [],
        evaluationHistory: [],
        reviewStatus: 'PENDING_REVIEW' as ReviewStatus,
        autoProcessed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as TransactionRiskEntity);
      riskRepo.save.mockResolvedValue({} as TransactionRiskEntity);
      transactionRepo.save.mockResolvedValue(mockTransaction);
      // Simulate 10 recent transactions
      transactionRepo.count.mockResolvedValue(10);

      const result = await service.evaluateRisk(transactionId, userId);

      expect(result.riskFactors.some((f) => f.rule === 'RAPID_CONSECUTIVE_TRANSFERS')).toBe(true);
    });
  });

  describe('Fraud Scenario: New Device Login', () => {
    it('should flag transactions from new devices', async () => {
      const transactionId = 'tx-new-device';
      const userId = 'user-device';
      const deviceId = 'device-new';

      const mockTransaction = {
        id: transactionId,
        amount: 5000,
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      } as TransactionEntity;

      transactionRepo.findOne.mockResolvedValue(mockTransaction);
      riskRepo.findOne.mockResolvedValue(null);
      riskRepo.create.mockReturnValue({
        id: 'risk-id-1',
        transactionId,
        riskScore: 0,
        riskLevel: 'LOW' as RiskLevel,
        isFlagged: false,
        riskFactors: [],
        evaluationHistory: [],
        reviewStatus: 'PENDING_REVIEW' as ReviewStatus,
        autoProcessed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as TransactionRiskEntity);
      riskRepo.save.mockResolvedValue({} as TransactionRiskEntity);
      transactionRepo.save.mockResolvedValue(mockTransaction);
      transactionRepo.find.mockResolvedValue([]);
      transactionRepo.count.mockResolvedValue(0);
      // Device not found - new device
      deviceRepo.findOne.mockResolvedValue(null);

      const result = await service.evaluateRisk(transactionId, userId, deviceId);

      expect(result.riskFactors.some((f) => f.rule === 'NEW_DEVICE')).toBe(true);
      expect(result.deviceContext?.isNewDevice).toBe(true);
    });

    it('should flag transactions from untrusted devices', async () => {
      const transactionId = 'tx-untrusted-device';
      const userId = 'user-device';
      const deviceId = 'device-untrusted';

      const mockTransaction = {
        id: transactionId,
        amount: 5000,
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      } as TransactionEntity;

      const mockDevice = {
        id: 'device-1',
        userId,
        deviceKey: deviceId,
        trustLevel: 'risky',
        trustScore: 20,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      } as DeviceEntity;

      transactionRepo.findOne.mockResolvedValue(mockTransaction);
      riskRepo.findOne.mockResolvedValue(null);
      riskRepo.create.mockReturnValue({
        id: 'risk-id-1',
        transactionId,
        riskScore: 0,
        riskLevel: 'LOW' as RiskLevel,
        isFlagged: false,
        riskFactors: [],
        evaluationHistory: [],
        reviewStatus: 'PENDING_REVIEW' as ReviewStatus,
        autoProcessed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as TransactionRiskEntity);
      riskRepo.save.mockResolvedValue({} as TransactionRiskEntity);
      transactionRepo.save.mockResolvedValue(mockTransaction);
      transactionRepo.find.mockResolvedValue([]);
      transactionRepo.count.mockResolvedValue(0);
      deviceRepo.findOne.mockResolvedValue(mockDevice);

      const result = await service.evaluateRisk(transactionId, userId, deviceId);

      expect(result.riskFactors.some((f) => f.rule === 'UNTRUSTED_DEVICE')).toBe(true);
    });
  });

  describe('Fraud Scenario: Velocity Anomaly', () => {
    it('should flag transactions with amount significantly higher than average', async () => {
      const transactionId = 'tx-velocity';
      const userId = 'user-velocity';

      const mockTransaction = {
        id: transactionId,
        amount: 50000, // Much higher than average
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      } as TransactionEntity;

      const mockHistoryTxs = [
        { amount: 100 },
        { amount: 150 },
        { amount: 200 },
        { amount: 120 },
        { amount: 180 },
      ] as TransactionEntity[];

      transactionRepo.findOne.mockResolvedValue(mockTransaction);
      riskRepo.findOne.mockResolvedValue(null);
      riskRepo.create.mockReturnValue({
        id: 'risk-id-1',
        transactionId,
        riskScore: 0,
        riskLevel: 'LOW' as RiskLevel,
        isFlagged: false,
        riskFactors: [],
        evaluationHistory: [],
        reviewStatus: 'PENDING_REVIEW' as ReviewStatus,
        autoProcessed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as TransactionRiskEntity);
      riskRepo.save.mockResolvedValue({} as TransactionRiskEntity);
      transactionRepo.save.mockResolvedValue(mockTransaction);
      transactionRepo.find.mockResolvedValue(mockHistoryTxs);
      transactionRepo.count.mockResolvedValue(0);

      const result = await service.evaluateRisk(transactionId, userId);

      expect(result.riskFactors.some((f) => f.rule === 'VELOCITY_ANOMALY')).toBe(true);
    });

    it('should flag unusual transaction frequency', async () => {
      const transactionId = 'tx-frequency';
      const userId = 'user-frequency';

      const mockTransaction = {
        id: transactionId,
        amount: 100,
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      } as TransactionEntity;

      const manyTransactions = Array(15).fill({ amount: 100 }) as TransactionEntity[];

      transactionRepo.findOne.mockResolvedValue(mockTransaction);
      riskRepo.findOne.mockResolvedValue(null);
      riskRepo.create.mockReturnValue({
        id: 'risk-id-1',
        transactionId,
        riskScore: 0,
        riskLevel: 'LOW' as RiskLevel,
        isFlagged: false,
        riskFactors: [],
        evaluationHistory: [],
        reviewStatus: 'PENDING_REVIEW' as ReviewStatus,
        autoProcessed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as TransactionRiskEntity);
      riskRepo.save.mockResolvedValue({} as TransactionRiskEntity);
      transactionRepo.save.mockResolvedValue(mockTransaction);
      // Return many transactions for both hour and day queries
      transactionRepo.find.mockResolvedValue(manyTransactions);
      transactionRepo.count.mockResolvedValue(0);

      const result = await service.evaluateRisk(transactionId, userId);

      expect(result.riskFactors.some((f) => f.rule === 'UNUSUAL_FREQUENCY')).toBe(true);
    });
  });

  describe('Risk Level Calculation', () => {
    it('should calculate CRITICAL risk level for high scores', async () => {
      const transactionId = 'tx-critical';

      const mockTransaction = {
        id: transactionId,
        amount: 100000, // Very high amount
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      } as TransactionEntity;

      transactionRepo.findOne.mockResolvedValue(mockTransaction);
      riskRepo.findOne.mockResolvedValue(null);
      riskRepo.create.mockReturnValue({
        id: 'risk-id-1',
        transactionId,
        riskScore: 0,
        riskLevel: 'LOW' as RiskLevel,
        isFlagged: false,
        riskFactors: [],
        evaluationHistory: [],
        reviewStatus: 'PENDING_REVIEW' as ReviewStatus,
        autoProcessed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as TransactionRiskEntity);
      riskRepo.save.mockResolvedValue({} as TransactionRiskEntity);
      transactionRepo.save.mockResolvedValue(mockTransaction);
      transactionRepo.find.mockResolvedValue([]);
      transactionRepo.count.mockResolvedValue(10); // Rapid transfers

      const result = await service.evaluateRisk(transactionId, 'user-1');

      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.isFlagged).toBe(true);
    });
  });

  describe('Admin Review Workflow', () => {
    it('should update review status correctly', async () => {
      const riskId = 'risk-1';
      const adminId = 'admin-1';

      const mockRiskRecord = {
        id: riskId,
        transactionId: 'tx-1',
        riskScore: 75,
        riskLevel: 'HIGH' as RiskLevel,
        isFlagged: true,
        reviewStatus: 'PENDING_REVIEW' as ReviewStatus,
        riskFactors: [],
        evaluationHistory: [],
        autoProcessed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as TransactionRiskEntity;

      riskRepo.findOne.mockResolvedValue(mockRiskRecord);
      riskRepo.save.mockImplementation((entity) => Promise.resolve(entity as TransactionRiskEntity));

      const result = await service.reviewFlaggedTransaction(
        riskId,
        adminId,
        'APPROVED' as ReviewStatus,
        'Looks legitimate',
        true,
      );

      expect(result.reviewStatus).toBe('APPROVED');
      expect(result.reviewedBy).toBe(adminId);
      expect(result.adminNotes).toBe('Looks legitimate');
    });
  });

  describe('Auto-Processing Prevention', () => {
    it('should prevent auto-processing for flagged pending transactions', async () => {
      const transactionId = 'tx-flagged';

      const mockRiskRecord = {
        id: 'risk-1',
        transactionId,
        isFlagged: true,
        reviewStatus: 'PENDING_REVIEW' as ReviewStatus,
      } as TransactionRiskEntity;

      riskRepo.findOne.mockResolvedValue(mockRiskRecord);

      const canProcess = await service.canAutoProcess(transactionId);

      expect(canProcess).toBe(false);
    });

    it('should allow auto-processing for approved transactions', async () => {
      const transactionId = 'tx-approved';

      const mockRiskRecord = {
        id: 'risk-1',
        transactionId,
        isFlagged: true,
        reviewStatus: 'APPROVED' as ReviewStatus,
      } as TransactionRiskEntity;

      riskRepo.findOne.mockResolvedValue(mockRiskRecord);

      const canProcess = await service.canAutoProcess(transactionId);

      expect(canProcess).toBe(true);
    });

    it('should prevent auto-processing for rejected transactions', async () => {
      const transactionId = 'tx-rejected';

      const mockRiskRecord = {
        id: 'risk-1',
        transactionId,
        isFlagged: true,
        reviewStatus: 'REJECTED' as ReviewStatus,
      } as TransactionRiskEntity;

      riskRepo.findOne.mockResolvedValue(mockRiskRecord);

      const canProcess = await service.canAutoProcess(transactionId);

      expect(canProcess).toBe(false);
    });
  });

  describe('Risk Statistics', () => {
    it('should calculate risk statistics correctly', async () => {
      riskRepo.count.mockResolvedValue(10);
      riskRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ average: 65.5 }),
      } as any);

      const stats = await service.getRiskStatistics();

      expect(stats.totalFlagged).toBe(10);
      expect(stats.averageRiskScore).toBe(65.5);
    });
  });
});
