import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationIssueEntity } from '../entities/reconciliation-issue.entity';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { BlockchainService } from '../../blockchain/blockchain.service';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let mockIssueRepo: any;
  let mockTxRepo: any;
  let mockHttpService: any;
  let mockBlockchainService: any;
  let mockConfigService: any;

  const mockTransaction = {
    id: 'tx-1',
    externalId: 'ext-123',
    status: 'PENDING',
    metadata: { txHash: '0x1234567890' },
    createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
  } as TransactionEntity;

  const mockIssue = {
    id: 'issue-1',
    transactionId: 'tx-1',
    mismatchType: 'PROVIDER_MISMATCH',
    internalStatus: 'PENDING',
    providerStatus: 'SUCCESS',
    status: 'OPEN',
  } as ReconciliationIssueEntity;

  beforeEach(async () => {
    mockIssueRepo = {
      create: jest.fn().mockReturnValue(mockIssue),
      save: jest.fn().mockResolvedValue(mockIssue),
      createQueryBuilder: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockIssue], 1]),
      }),
    };

    mockTxRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTransaction]),
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockHttpService = {
      get: jest.fn().mockReturnValue(
        of({
          data: {
            status: 'COMPLETED',
            id: 'ext-123',
          },
        }),
      ),
    };

    mockBlockchainService = {
      getTransactionStatus: jest.fn().mockResolvedValue('SUCCESS'),
      getTransactionReceipt: jest.fn().mockResolvedValue({
        blockNumber: 100,
        isValid: true,
        confirmations: 15,
      }),
      getCurrentBlock: jest.fn().mockResolvedValue(115),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, any> = {
          PROVIDER_API_URL: 'https://api.provider.com',
          PROVIDER_API_KEY: 'test-key',
          PROVIDER_API_TIMEOUT: 30000,
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        {
          provide: getRepositoryToken(ReconciliationIssueEntity),
          useValue: mockIssueRepo,
        },
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: mockTxRepo,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: BlockchainService,
          useValue: mockBlockchainService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runReconciliation', () => {
    it('should detect PROVIDER_MISMATCH', async () => {
      // Provider returns SUCCESS, blockchain not yet confirmed
      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'COMPLETED' },
        }),
      );
      mockBlockchainService.getTransactionStatus.mockResolvedValue(null);

      await service.runReconciliation();

      expect(mockTxRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/ext-123'),
        expect.any(Object),
      );
      expect(mockIssueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mismatchType: 'PROVIDER_MISMATCH',
        }),
      );
    });

    it('should detect BLOCKCHAIN_MISMATCH', async () => {
      // Provider not available, blockchain shows SUCCESS
      mockHttpService.get.mockReturnValue(throwError(() => new Error('API Error')));
      mockBlockchainService.getTransactionStatus.mockResolvedValue('SUCCESS');

      await service.runReconciliation();

      expect(mockIssueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mismatchType: 'BLOCKCHAIN_MISMATCH',
        }),
      );
    });

    it('should detect BOTH_MISMATCH', async () => {
      // Provider says SUCCESS, blockchain says FAILED
      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'COMPLETED' },
        }),
      );
      mockBlockchainService.getTransactionStatus.mockResolvedValue('FAILED');

      await service.runReconciliation();

      expect(mockIssueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mismatchType: 'BOTH_MISMATCH',
        }),
      );
    });

    it('should auto-resolve when provider and blockchain agree on SUCCESS', async () => {
      // Both agree on SUCCESS
      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'COMPLETED' },
        }),
      );
      mockBlockchainService.getTransactionStatus.mockResolvedValue('SUCCESS');

      await service.runReconciliation();

      expect(mockTxRepo.update).toHaveBeenCalledWith('tx-1', {
        status: 'SUCCESS',
      });
      expect(mockIssueRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'AUTO_RESOLVED',
          resolution: expect.stringContaining('SUCCESS'),
        }),
      );
    });

    it('should escalate when provider and blockchain disagree', async () => {
      // Provider says SUCCESS, blockchain says FAILED
      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'COMPLETED' },
        }),
      );
      mockBlockchainService.getTransactionStatus.mockResolvedValue('FAILED');

      await service.runReconciliation();

      expect(mockIssueRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ESCALATED',
          resolution: expect.stringContaining('manual review'),
        }),
      );
    });

    it('should set AUTO_RESOLVED status when agreement on FAILED', async () => {
      // Both agree on FAILED
      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'FAILED' },
        }),
      );
      mockBlockchainService.getTransactionStatus.mockResolvedValue('FAILED');

      await service.runReconciliation();

      expect(mockTxRepo.update).toHaveBeenCalledWith('tx-1', {
        status: 'FAILED',
      });
      expect(mockIssueRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'AUTO_RESOLVED',
        }),
      );
    });

    it('should skip transactions with no mismatches', async () => {
      // Both provider and blockchain match transaction status (PENDING)
      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'PENDING' },
        }),
      );
      mockBlockchainService.getTransactionStatus.mockResolvedValue(null);

      await service.runReconciliation();

      // Should not create any issue
      expect(mockIssueRepo.create).not.toHaveBeenCalled();
    });

    it('should handle transactions without externalId gracefully', async () => {
      const txWithoutExternalId = {
        ...mockTransaction,
        externalId: undefined,
      };
      mockTxRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([txWithoutExternalId]),
      });

      mockBlockchainService.getTransactionStatus.mockResolvedValue('SUCCESS');

      await service.runReconciliation();

      // Provider status should be null, blockchain shows success → BLOCKCHAIN_MISMATCH
      expect(mockIssueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mismatchType: 'BLOCKCHAIN_MISMATCH',
        }),
      );
    });

    it('should handle transactions without txHash gracefully', async () => {
      const txWithoutHash = {
        ...mockTransaction,
        metadata: {},
      };
      mockTxRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([txWithoutHash]),
      });

      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'COMPLETED' },
        }),
      );

      await service.runReconciliation();

      // Blockchain status should be null, provider shows success → PROVIDER_MISMATCH
      expect(mockIssueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mismatchType: 'PROVIDER_MISMATCH',
        }),
      );
    });

    it('should handle provider API errors gracefully', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Connection timeout')),
      );
      mockBlockchainService.getTransactionStatus.mockResolvedValue('SUCCESS');

      await service.runReconciliation();

      // Provider error returns null, blockchain shows success → BLOCKCHAIN_MISMATCH
      expect(mockIssueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mismatchType: 'BLOCKCHAIN_MISMATCH',
        }),
      );
    });

    it('should handle blockchain service errors gracefully', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'COMPLETED' },
        }),
      );
      mockBlockchainService.getTransactionStatus.mockRejectedValue(
        new Error('RPC error'),
      );

      await service.runReconciliation();

      // Blockchain error returns null, provider shows success → PROVIDER_MISMATCH
      expect(mockIssueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mismatchType: 'PROVIDER_MISMATCH',
        }),
      );
    });
  });

  describe('getIssues', () => {
    it('should retrieve paginated issues', async () => {
      const query = { page: 1, limit: 20 };
      const result = await service.getIssues(query);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([mockIssue]);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.total).toBe(1);
    });

    it('should filter issues by status', async () => {
      const query = { page: 1, limit: 20, status: 'ESCALATED' };
      await service.getIssues(query);

      const qb = mockIssueRepo.createQueryBuilder();
      expect(qb.where).toHaveBeenCalledWith(
        'i.status = :status',
        expect.any(Object),
      );
    });
  });

  describe('Provider status normalization', () => {
    it('should normalize COMPLETED to SUCCESS', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'COMPLETED' },
        }),
      );
      mockBlockchainService.getTransactionStatus.mockResolvedValue(null);

      await service.runReconciliation();

      // Check that provider status was normalized
      expect(mockIssueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          providerStatus: 'SUCCESS',
        }),
      );
    });

    it('should normalize FAILED to FAILED', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'FAILED' },
        }),
      );
      mockBlockchainService.getTransactionStatus.mockResolvedValue(null);

      await service.runReconciliation();

      expect(mockIssueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          providerStatus: 'FAILED',
        }),
      );
    });

    it('should handle case-insensitive provider status', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { status: 'completed' },
        }),
      );
      mockBlockchainService.getTransactionStatus.mockResolvedValue(null);

      await service.runReconciliation();

      expect(mockIssueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          providerStatus: 'SUCCESS',
        }),
      );
    });
  });
});
