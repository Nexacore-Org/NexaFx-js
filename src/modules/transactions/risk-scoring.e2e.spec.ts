import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as request from 'supertest';
import { TransactionsModule } from './transactions.module';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionRiskEntity } from './entities/transaction-risk.entity';
import { DeviceEntity } from '../sessions/entities/device.entity';
import { RiskScoringService } from './services/risk-scoring.service';

describe('Risk Scoring E2E Tests (Fraud Scenarios)', () => {
  let app: INestApplication;
  let transactionRepo: Repository<TransactionEntity>;
  let riskRepo: Repository<TransactionRiskEntity>;
  let deviceRepo: Repository<DeviceEntity>;
  let riskScoringService: RiskScoringService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [TransactionEntity, TransactionRiskEntity, DeviceEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([TransactionEntity, TransactionRiskEntity, DeviceEntity]),
        TransactionsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    transactionRepo = moduleFixture.get<Repository<TransactionEntity>>(
      getRepositoryToken(TransactionEntity),
    );
    riskRepo = moduleFixture.get<Repository<TransactionRiskEntity>>(
      getRepositoryToken(TransactionRiskEntity),
    );
    deviceRepo = moduleFixture.get<Repository<DeviceEntity>>(getRepositoryToken(DeviceEntity));
    riskScoringService = moduleFixture.get<RiskScoringService>(RiskScoringService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await riskRepo.clear();
    await transactionRepo.clear();
    await deviceRepo.clear();
  });

  describe('Fraud Scenario 1: High-Value Transaction Attack', () => {
    it('should detect and flag unusually high-value transactions', async () => {
      const userId = 'user-high-value';
      const deviceId = 'device-trusted';

      // Create a trusted device
      await deviceRepo.save({
        userId,
        deviceKey: deviceId,
        trustLevel: 'trusted',
        trustScore: 80,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      });

      // Create transaction history with normal amounts
      for (let i = 0; i < 5; i++) {
        await transactionRepo.save({
          amount: 100 + i * 50,
          currency: 'USD',
          status: 'SUCCESS',
          createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        });
      }

      // Create a suspicious high-value transaction
      const highValueTx = await transactionRepo.save({
        amount: 50000, // $50,000 - way above normal pattern
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      });

      // Evaluate risk
      const result = await riskScoringService.evaluateRisk(highValueTx.id, userId, deviceId);

      // Assertions
      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.isFlagged).toBe(true);
      expect(result.riskFactors.some((f) => f.rule === 'HIGH_VALUE_TRANSACTION')).toBe(true);
      expect(result.requiresManualReview).toBe(true);

      // Verify transaction was updated
      const updatedTx = await transactionRepo.findOne({ where: { id: highValueTx.id } });
      expect(updatedTx?.isFlagged).toBe(true);
      expect(updatedTx?.requiresManualReview).toBe(true);

      // Verify risk record was created
      const riskRecord = await riskRepo.findOne({
        where: { transactionId: highValueTx.id },
      });
      expect(riskRecord).toBeDefined();
      expect(riskRecord?.isFlagged).toBe(true);
    });
  });

  describe('Fraud Scenario 2: Rapid Fire Attack', () => {
    it('should detect multiple transactions in short time window', async () => {
      const userId = 'user-rapid';
      const deviceId = 'device-rapid';

      // Create a trusted device
      await deviceRepo.save({
        userId,
        deviceKey: deviceId,
        trustLevel: 'trusted',
        trustScore: 80,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });

      // Create 10 transactions in the last hour
      const now = new Date();
      for (let i = 0; i < 10; i++) {
        await transactionRepo.save({
          amount: 500,
          currency: 'USD',
          status: 'SUCCESS',
          createdAt: new Date(now.getTime() - i * 5 * 60 * 1000), // Every 5 minutes
        });
      }

      // Create another transaction that should trigger rapid transfer detection
      const rapidTx = await transactionRepo.save({
        amount: 1000,
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      });

      const result = await riskScoringService.evaluateRisk(rapidTx.id, userId, deviceId);

      expect(result.riskFactors.some((f) => f.rule === 'RAPID_CONSECUTIVE_TRANSFERS')).toBe(true);
      expect(result.velocityData?.transactionsInLastHour).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Fraud Scenario 3: Account Takeover via New Device', () => {
    it('should flag transactions from new/unrecognized devices', async () => {
      const userId = 'user-ato';
      const trustedDeviceId = 'device-trusted';
      const newDeviceId = 'device-new-suspicious';

      // Create a trusted device
      await deviceRepo.save({
        userId,
        deviceKey: trustedDeviceId,
        trustLevel: 'trusted',
        trustScore: 90,
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        lastLoginAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      });

      // Create transaction from new device (not in device table)
      const suspiciousTx = await transactionRepo.save({
        amount: 5000,
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      });

      const result = await riskScoringService.evaluateRisk(suspiciousTx.id, userId, newDeviceId);

      expect(result.riskFactors.some((f) => f.rule === 'NEW_DEVICE')).toBe(true);
      expect(result.deviceContext?.isNewDevice).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(25);
    });

    it('should flag transactions from untrusted/risky devices', async () => {
      const userId = 'user-risky-device';
      const riskyDeviceId = 'device-risky';

      // Create a risky device
      await deviceRepo.save({
        userId,
        deviceKey: riskyDeviceId,
        trustLevel: 'risky',
        trustScore: 20,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      });

      const riskyTx = await transactionRepo.save({
        amount: 3000,
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      });

      const result = await riskScoringService.evaluateRisk(riskyTx.id, userId, riskyDeviceId);

      expect(result.riskFactors.some((f) => f.rule === 'UNTRUSTED_DEVICE')).toBe(true);
      expect(result.deviceContext?.deviceTrustScore).toBe(20);
    });
  });

  describe('Fraud Scenario 4: Velocity Anomaly Detection', () => {
    it('should detect transactions significantly above user average', async () => {
      const userId = 'user-velocity';
      const deviceId = 'device-velocity';

      await deviceRepo.save({
        userId,
        deviceKey: deviceId,
        trustLevel: 'trusted',
        trustScore: 85,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });

      // Create history with small amounts (average ~$100)
      for (let i = 0; i < 20; i++) {
        await transactionRepo.save({
          amount: 50 + Math.random() * 100,
          currency: 'USD',
          status: 'SUCCESS',
          createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        });
      }

      // Create a transaction 10x above average
      const anomalousTx = await transactionRepo.save({
        amount: 5000, // 10x the average
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      });

      const result = await riskScoringService.evaluateRisk(anomalousTx.id, userId, deviceId);

      expect(result.riskFactors.some((f) => f.rule === 'VELOCITY_ANOMALY')).toBe(true);
      expect(result.velocityData?.averageTransactionAmount).toBeGreaterThan(0);
    });
  });

  describe('Fraud Scenario 5: Combined Risk Factors', () => {
    it('should accumulate risk scores from multiple factors', async () => {
      const userId = 'user-combined';
      const newDeviceId = 'device-never-seen';

      // No device record - completely new device

      // Create some transaction history
      for (let i = 0; i < 5; i++) {
        await transactionRepo.save({
          amount: 100,
          currency: 'USD',
          status: 'SUCCESS',
          createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        });
      }

      // Create a transaction with multiple risk factors:
      // 1. High value
      // 2. New device
      // 3. Velocity anomaly
      const highRiskTx = await transactionRepo.save({
        amount: 25000, // High value
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      });

      const result = await riskScoringService.evaluateRisk(highRiskTx.id, userId, newDeviceId);

      // Should have multiple risk factors
      expect(result.riskFactors.length).toBeGreaterThan(1);

      // Should be flagged due to high combined score
      expect(result.isFlagged).toBe(true);
      expect(result.riskScore).toBeGreaterThan(50);

      // Should require manual review
      expect(result.requiresManualReview).toBe(true);
    });
  });

  describe('Admin Review Workflow', () => {
    it('should allow admin to review and approve flagged transactions', async () => {
      const userId = 'user-review';
      const deviceId = 'device-review';

      await deviceRepo.save({
        userId,
        deviceKey: deviceId,
        trustLevel: 'trusted',
        trustScore: 80,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });

      // Create and flag a transaction
      const tx = await transactionRepo.save({
        amount: 50000,
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      });

      await riskScoringService.evaluateRisk(tx.id, userId, deviceId);

      // Get the risk record
      const riskRecord = await riskRepo.findOne({ where: { transactionId: tx.id } });
      expect(riskRecord?.isFlagged).toBe(true);
      expect(riskRecord?.reviewStatus).toBe('PENDING_REVIEW');

      // Admin reviews and approves
      const adminId = 'admin-1';
      await riskScoringService.reviewFlaggedTransaction(
        riskRecord!.id,
        adminId,
        'APPROVED' as any,
        'Verified with customer',
        true,
      );

      // Verify the review was recorded
      const updatedRisk = await riskRepo.findOne({ where: { id: riskRecord!.id } });
      expect(updatedRisk?.reviewStatus).toBe('APPROVED');
      expect(updatedRisk?.reviewedBy).toBe(adminId);
      expect(updatedRisk?.adminNotes).toBe('Verified with customer');

      // Should now allow auto-processing
      const canProcess = await riskScoringService.canAutoProcess(tx.id);
      expect(canProcess).toBe(true);
    });

    it('should prevent auto-processing for rejected transactions', async () => {
      const userId = 'user-reject';
      const deviceId = 'device-reject';

      await deviceRepo.save({
        userId,
        deviceKey: deviceId,
        trustLevel: 'trusted',
        trustScore: 80,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });

      const tx = await transactionRepo.save({
        amount: 50000,
        currency: 'USD',
        status: 'PENDING',
        createdAt: new Date(),
      });

      await riskScoringService.evaluateRisk(tx.id, userId, deviceId);
      const riskRecord = await riskRepo.findOne({ where: { transactionId: tx.id } });

      // Admin rejects
      await riskScoringService.reviewFlaggedTransaction(
        riskRecord!.id,
        'admin-1',
        'REJECTED' as any,
        'Confirmed fraud',
        false,
      );

      // Should NOT allow auto-processing
      const canProcess = await riskScoringService.canAutoProcess(tx.id);
      expect(canProcess).toBe(false);
    });
  });

  describe('Risk Statistics', () => {
    it('should provide accurate risk statistics', async () => {
      const userId = 'user-stats';
      const deviceId = 'device-stats';

      await deviceRepo.save({
        userId,
        deviceKey: deviceId,
        trustLevel: 'trusted',
        trustScore: 80,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });

      // Create multiple transactions with different risk profiles
      for (let i = 0; i < 5; i++) {
        const tx = await transactionRepo.save({
          amount: 50000, // High value to trigger flagging
          currency: 'USD',
          status: 'PENDING',
          createdAt: new Date(),
        });
        await riskScoringService.evaluateRisk(tx.id, userId, deviceId);
      }

      const stats = await riskScoringService.getRiskStatistics();

      expect(stats.totalFlagged).toBe(5);
      expect(stats.pendingReview).toBe(5);
      expect(stats.averageRiskScore).toBeGreaterThan(0);
    });
  });
});
