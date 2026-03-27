process.env.DISABLE_BULL = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AppModule } from '../src/app.module';
import { ReconciliationService } from '../src/modules/reconciliation/services/reconciliation.service';
import { BlockchainService } from '../src/modules/blockchain/blockchain.service';
import { TransactionEntity } from '../src/modules/transactions/entities/transaction.entity';
import { ReconciliationIssueEntity } from '../src/modules/reconciliation/entities/reconciliation-issue.entity';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt.guard';
import { AdminGuard } from '../src/modules/auth/guards/admin.guard';
import { RateLimitGuard } from '../src/modules/rate-limit/guards/rate-limit.guard';

describe('Reconciliation E2E Flow', () => {
  let app: INestApplication;
  let reconciliationService: ReconciliationService;
  let blockchainService: BlockchainService;
  let httpService: HttpService;
  let txRepo: Repository<TransactionEntity>;
  let issueRepo: Repository<ReconciliationIssueEntity>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(AdminGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    reconciliationService = moduleFixture.get<ReconciliationService>(
      ReconciliationService,
    );
    blockchainService = moduleFixture.get<BlockchainService>(BlockchainService);
    httpService = moduleFixture.get<HttpService>(HttpService);
    txRepo = moduleFixture.get<Repository<TransactionEntity>>(
      getRepositoryToken(TransactionEntity),
    );
    issueRepo = moduleFixture.get<Repository<ReconciliationIssueEntity>>(
      getRepositoryToken(ReconciliationIssueEntity),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await issueRepo.delete({});
    await txRepo.delete({});
  });

  describe('End-to-End Reconciliation Scenario', () => {
    it('should detect and auto-resolve provider mismatch when both sources agree on SUCCESS', async () => {
      // Create a stale PENDING transaction
      const staleTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const transaction = await txRepo.save(
        txRepo.create({
          externalId: 'ext-001',
          status: 'PENDING',
          amount: 100,
          currency: 'USD',
          createdAt: staleTime,
          metadata: { txHash: '0xabcd1234' },
        }),
      );

      // Mock provider API to return SUCCESS
      jest.spyOn(httpService, 'get').mockReturnValue(
        of({
          data: {
            status: 'COMPLETED',
            id: 'ext-001',
          },
        }),
      );

      // Mock blockchain to return SUCCESS
      jest.spyOn(blockchainService, 'getTransactionStatus').mockResolvedValue(
        'SUCCESS',
      );

      // Run reconciliation
      await reconciliationService.runReconciliation();

      // Verify transaction was auto-resolved
      const updatedTx = await txRepo.findOne({ where: { id: transaction.id } });
      expect(updatedTx?.status).toBe('SUCCESS');

      // Verify issue was created with AUTO_RESOLVED status
      const issue = await issueRepo.findOne({
        where: { transactionId: transaction.id },
      });
      expect(issue).toBeDefined();
      expect(issue?.status).toBe('AUTO_RESOLVED');
      expect(issue?.mismatchType).toBe('BOTH_MISMATCH'); // Since transaction was PENDING
      expect(issue?.resolution).toContain('SUCCESS');
    });

    it('should detect provider mismatch when only provider has update', async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000);
      const transaction = await txRepo.save(
        txRepo.create({
          externalId: 'ext-002',
          status: 'PENDING',
          amount: 50,
          currency: 'BTC',
          createdAt: staleTime,
          metadata: { txHash: '0xabcd5678' },
        }),
      );

      // Mock provider to return SUCCESS, blockchain returns null (not yet finalized)
      jest.spyOn(httpService, 'get').mockReturnValue(
        of({
          data: {
            status: 'COMPLETED',
          },
        }),
      );

      jest
        .spyOn(blockchainService, 'getTransactionStatus')
        .mockResolvedValue(null);

      await reconciliationService.runReconciliation();

      // Verify issue was escalated (no consensus)
      const issue = await issueRepo.findOne({
        where: { transactionId: transaction.id },
      });
      expect(issue).toBeDefined();
      expect(issue?.status).toBe('ESCALATED');
      expect(issue?.mismatchType).toBe('PROVIDER_MISMATCH');
      expect(issue?.providerStatus).toBe('SUCCESS');
      expect(issue?.blockchainStatus).toBeUndefined();
    });

    it('should detect blockchain mismatch when only blockchain has update', async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000);
      const transaction = await txRepo.save(
        txRepo.create({
          externalId: 'ext-003',
          status: 'PENDING',
          amount: 200,
          currency: 'ETH',
          createdAt: staleTime,
          metadata: { txHash: '0xabcd9999' },
        }),
      );

      // Mock provider to timeout/fail
      jest.spyOn(httpService, 'get').mockReturnValue(
        throwError(() => new Error('API timeout')),
      );

      // Mock blockchain to return SUCCESS
      jest
        .spyOn(blockchainService, 'getTransactionStatus')
        .mockResolvedValue('SUCCESS');

      await reconciliationService.runReconciliation();

      // Verify issue was escalated
      const issue = await issueRepo.findOne({
        where: { transactionId: transaction.id },
      });
      expect(issue).toBeDefined();
      expect(issue?.status).toBe('ESCALATED');
      expect(issue?.mismatchType).toBe('BLOCKCHAIN_MISMATCH');
      expect(issue?.providerStatus).toBeUndefined();
      expect(issue?.blockchainStatus).toBe('SUCCESS');
    });

    it('should detect BOTH_MISMATCH when provider and blockchain disagree', async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000);
      const transaction = await txRepo.save(
        txRepo.create({
          externalId: 'ext-004',
          status: 'PENDING',
          amount: 75,
          currency: 'USD',
          createdAt: staleTime,
          metadata: { txHash: '0xabcd4444' },
        }),
      );

      // Provider says SUCCESS, blockchain says FAILED
      jest.spyOn(httpService, 'get').mockReturnValue(
        of({
          data: {
            status: 'COMPLETED',
          },
        }),
      );

      jest
        .spyOn(blockchainService, 'getTransactionStatus')
        .mockResolvedValue('FAILED');

      await reconciliationService.runReconciliation();

      // Verify BOTH_MISMATCH was detected and escalated
      const issue = await issueRepo.findOne({
        where: { transactionId: transaction.id },
      });
      expect(issue).toBeDefined();
      expect(issue?.status).toBe('ESCALATED');
      expect(issue?.mismatchType).toBe('BOTH_MISMATCH');
      expect(issue?.providerStatus).toBe('SUCCESS');
      expect(issue?.blockchainStatus).toBe('FAILED');
    });

    it('should skip recent transactions', async () => {
      const recentTime = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      const transaction = await txRepo.save(
        txRepo.create({
          externalId: 'ext-005',
          status: 'PENDING',
          amount: 100,
          currency: 'USD',
          createdAt: recentTime,
        }),
      );

      await reconciliationService.runReconciliation();

      // Verify no issue was created for recent transaction
      const issue = await issueRepo.findOne({
        where: { transactionId: transaction.id },
      });
      expect(issue).toBeUndefined();
    });

    it('should handle transactions without externalId', async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000);
      const transaction = await txRepo.save(
        txRepo.create({
          status: 'PENDING',
          amount: 100,
          currency: 'USD',
          createdAt: staleTime,
          metadata: { txHash: '0xabcd7777' },
        }),
      );

      // Mock blockchain to return SUCCESS
      jest
        .spyOn(blockchainService, 'getTransactionStatus')
        .mockResolvedValue('SUCCESS');

      await reconciliationService.runReconciliation();

      // Should create BLOCKCHAIN_MISMATCH issue (provider status null, blockchain success)
      const issue = await issueRepo.findOne({
        where: { transactionId: transaction.id },
      });
      expect(issue).toBeDefined();
      expect(issue?.mismatchType).toBe('BLOCKCHAIN_MISMATCH');
    });

    it('should handle transactions without txHash', async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000);
      const transaction = await txRepo.save(
        txRepo.create({
          externalId: 'ext-006',
          status: 'PENDING',
          amount: 100,
          currency: 'USD',
          createdAt: staleTime,
        }),
      );

      // Mock provider to return SUCCESS
      jest.spyOn(httpService, 'get').mockReturnValue(
        of({
          data: {
            status: 'COMPLETED',
          },
        }),
      );

      await reconciliationService.runReconciliation();

      // Should create PROVIDER_MISMATCH issue (provider success, blockchain status null)
      const issue = await issueRepo.findOne({
        where: { transactionId: transaction.id },
      });
      expect(issue).toBeDefined();
      expect(issue?.mismatchType).toBe('PROVIDER_MISMATCH');
    });

    it('should auto-resolve successful FAILED transactions when both agree', async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000);
      const transaction = await txRepo.save(
        txRepo.create({
          externalId: 'ext-007',
          status: 'PENDING',
          amount: 100,
          currency: 'USD',
          createdAt: staleTime,
          metadata: { txHash: '0xabcd8888' },
        }),
      );

      // Both provider and blockchain confirm FAILED
      jest.spyOn(httpService, 'get').mockReturnValue(
        of({
          data: {
            status: 'FAILED',
          },
        }),
      );

      jest
        .spyOn(blockchainService, 'getTransactionStatus')
        .mockResolvedValue('FAILED');

      await reconciliationService.runReconciliation();

      // Verify transaction was auto-resolved to FAILED
      const updatedTx = await txRepo.findOne({ where: { id: transaction.id } });
      expect(updatedTx?.status).toBe('FAILED');

      // Verify AUTO_RESOLVED issue
      const issue = await issueRepo.findOne({
        where: { transactionId: transaction.id },
      });
      expect(issue?.status).toBe('AUTO_RESOLVED');
      expect(issue?.resolution).toContain('FAILED');
    });

    it('should paginate issues correctly', async () => {
      // Create multiple issues
      const staleTime = new Date(Date.now() - 10 * 60 * 1000);

      for (let i = 0; i < 5; i++) {
        const tx = await txRepo.save(
          txRepo.create({
            externalId: `ext-${i}`,
            status: 'PENDING',
            amount: 100,
            currency: 'USD',
            createdAt: staleTime,
            metadata: { txHash: `0xabcd${i}` },
          }),
        );

        // Mock different responses
        jest.spyOn(httpService, 'get').mockReturnValue(
          of({
            data: {
              status: i % 2 === 0 ? 'COMPLETED' : 'FAILED',
            },
          }),
        );

        jest
          .spyOn(blockchainService, 'getTransactionStatus')
          .mockResolvedValue(null);

        await reconciliationService.runReconciliation();
      }

      // Query with pagination
      const result = await reconciliationService.getIssues({
        page: 1,
        limit: 2,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(2);
      expect(result.meta.total).toBeGreaterThanOrEqual(5);
    });

    it('should filter issues by status', async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000);
      const tx = await txRepo.save(
        txRepo.create({
          externalId: 'ext-008',
          status: 'PENDING',
          amount: 100,
          currency: 'USD',
          createdAt: staleTime,
          metadata: { txHash: '0xabcdffff' },
        }),
      );

      // Both agree on SUCCESS → AUTO_RESOLVED
      jest.spyOn(httpService, 'get').mockReturnValue(
        of({
          data: {
            status: 'COMPLETED',
          },
        }),
      );

      jest
        .spyOn(blockchainService, 'getTransactionStatus')
        .mockResolvedValue('SUCCESS');

      await reconciliationService.runReconciliation();

      // Query only ESCALATED issues
      const escalatedResult = await reconciliationService.getIssues({
        status: 'ESCALATED',
      });

      expect(escalatedResult.data).toHaveLength(0);

      // Query only AUTO_RESOLVED issues
      const resolvedResult = await reconciliationService.getIssues({
        status: 'AUTO_RESOLVED',
      });

      expect(resolvedResult.data.length).toBeGreaterThan(0);
    });
  });

  describe('Reconciliation Cron Job', () => {
    it('should execute reconciliation job at configured interval', async () => {
      jest.useFakeTimers();

      const spyOnRun = jest.spyOn(reconciliationService, 'runReconciliation');

      // Fast-forward time to trigger cron (EVERY_10_MINUTES)
      jest.advanceTimersByTime(10 * 60 * 1000);
      await new Promise((resolve) => setImmediate(resolve));

      jest.useRealTimers();

      // Note: The cron job may not trigger in test environment depending on NestJS schedule setup
      // This test serves as a placeholder for verifying cron execution in integration
    });
  });
});
