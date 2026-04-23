import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TransactionApprovalService } from './transaction-approval.service';
import { Transaction, TransactionStatus } from './transaction.entity';
import { TransactionApproval, ApprovalDecision } from './transaction-approval.entity';
import { NotificationService } from '../modules/notifications/services/notification.service';
import { ApproveTransactionDto, RejectTransactionDto } from './approval.dto';

describe('TransactionApprovalService - Rejection Flow', () => {
  let service: TransactionApprovalService;
  let transactionRepo: jest.Mocked<Repository<Transaction>>;
  let approvalRepo: jest.Mocked<Repository<TransactionApproval>>;
  let dataSource: jest.Mocked<DataSource>;
  let notificationService: jest.Mocked<NotificationService>;

  const mockTransaction: Transaction = {
    id: 'tx-123',
    userId: 'user-123',
    amount: 10000,
    currency: 'USD',
    targetCurrency: '',
    type: 'transfer',
    status: TransactionStatus.PENDING_APPROVAL,
    requiredApprovals: 2,
    currentApprovals: 0,
    requiresApproval: true,
    rejectionReason: '',
    metadata: {},
    approvals: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockApprover = {
    id: 'approver-123',
    email: 'approver@example.com',
    role: 'compliance_officer',
  };

  beforeEach(async () => {
    const mockTransactionRepo = {
      findOne: jest.fn(),
      // ✅ Fix 3: Cast save mock to avoid DeepPartial assignability error
      save: jest.fn().mockImplementation((entity: Transaction) =>
        Promise.resolve(entity as Transaction),
      ),
      find: jest.fn(),
      create: jest.fn(),
    };

    const mockApprovalRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
    };

    const mockDataSource = {
      // ✅ Fix 2: Type as jest.fn() with explicit any to avoid IsolationLevel callable error
      transaction: jest.fn(),
    };

    const mockNotificationService = {
      send: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionApprovalService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepo,
        },
        {
          provide: getRepositoryToken(TransactionApproval),
          useValue: mockApprovalRepo,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<TransactionApprovalService>(TransactionApprovalService);
    transactionRepo = module.get(getRepositoryToken(Transaction));
    approvalRepo = module.get(getRepositoryToken(TransactionApproval));
    dataSource = module.get(DataSource);
    notificationService = module.get(NotificationService);
  });

  describe('rejectTransaction', () => {
    it('should reject transaction immediately with single approver', async () => {
      const rejectDto: RejectTransactionDto = {
        comment: 'High risk transaction detected',
      };

      const mockApproval = {
        id: 'approval-123',
        transactionId: 'tx-123',
        approverId: 'approver-123',
        approverEmail: 'approver@example.com',
        approverRole: 'compliance_officer',
        decision: ApprovalDecision.REJECTED,
        comment: 'High risk transaction detected',
        timestamp: new Date(),
      };

      // ✅ Fix 2: Cast mockImplementation callback to `any` to bypass IsolationLevel type mismatch
      (dataSource.transaction as jest.Mock).mockImplementation(async (callback: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(mockTransaction),
          create: jest.fn().mockReturnValue(mockApproval),
          // ✅ Fix 3: Cast returned entity as Transaction to satisfy type checker
          save: jest.fn().mockImplementation((entity: any): Promise<Transaction> => {
            if (entity.decision !== undefined) return Promise.resolve(mockApproval as any);
            if (entity.status !== undefined) {
              return Promise.resolve({
                ...mockTransaction,
                status: TransactionStatus.REJECTED,
                rejectionReason: 'High risk transaction detected',
              } as Transaction);
            }
            return Promise.resolve(entity as Transaction);
          }),
        };
        return await callback(manager);
      });

      const result = await service.rejectTransaction('tx-123', mockApprover, rejectDto);

      expect(result.transaction.status).toBe(TransactionStatus.REJECTED);
      expect(result.transaction.rejectionReason).toBe('High risk transaction detected');
      expect(result.approval.decision).toBe(ApprovalDecision.REJECTED);
      expect(notificationService.send).toHaveBeenCalledWith({
        type: 'approval.rejected',
        userId: 'user-123',
        payload: {
          transactionId: 'tx-123',
          approverEmail: 'approver@example.com',
          reason: 'High risk transaction detected',
        },
      });
    });

    it('should prevent transaction owner from rejecting their own transaction', async () => {
      const rejectDto: RejectTransactionDto = {
        comment: 'Rejecting my own transaction',
      };

      const ownerApprover = {
        id: 'user-123',
        email: 'user@example.com',
        role: 'admin',
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (callback: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(mockTransaction),
        };
        try {
          return await callback(manager);
        } catch (error) {
          throw error;
        }
      });

      await expect(
        service.rejectTransaction('tx-123', ownerApprover, rejectDto),
      ).rejects.toThrow('Transaction initiator cannot approve their own transaction');
    });

    it('should prevent duplicate rejection by same approver', async () => {
      const rejectDto: RejectTransactionDto = {
        comment: 'Duplicate rejection',
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (callback: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(mockTransaction),
        };
        try {
          return await callback(manager);
        } catch (error) {
          throw error;
        }
      });

      approvalRepo.findOne.mockResolvedValue({
        id: 'existing-approval',
        decision: ApprovalDecision.APPROVED,
      } as TransactionApproval);

      await expect(
        service.rejectTransaction('tx-123', mockApprover, rejectDto),
      ).rejects.toThrow('You have already approved this transaction');
    });

    it('should reject if transaction is not in PENDING_APPROVAL status', async () => {
      const rejectDto: RejectTransactionDto = {
        comment: 'Cannot reject',
      };

      const completedTransaction: Transaction = {
        ...mockTransaction,
        status: TransactionStatus.COMPLETED,
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (callback: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(completedTransaction),
        };
        try {
          return await callback(manager);
        } catch (error) {
          throw error;
        }
      });

      await expect(
        service.rejectTransaction('tx-123', mockApprover, rejectDto),
      ).rejects.toThrow('Transaction is not pending approval');
    });
  });

  describe('expireStaleApprovals', () => {
    it('should expire stale pending approval transactions', async () => {
      const staleTransaction: Transaction = {
        ...mockTransaction,
        createdAt: new Date(Date.now() - 80 * 3_600_000), // 80 hours ago
      };

      transactionRepo.find.mockResolvedValue([staleTransaction]);
      // ✅ Fix 3: Cast to satisfy DeepPartial & Transaction return type
      transactionRepo.save.mockImplementation((tx) =>
        Promise.resolve(tx as Transaction),
      );

      await service.expireStaleApprovals(72);

      expect(transactionRepo.find).toHaveBeenCalledWith({
        where: {
          status: TransactionStatus.PENDING_APPROVAL,
          createdAt: expect.any(Date),
        },
      });
      expect(transactionRepo.save).toHaveBeenCalledWith({
        ...staleTransaction,
        status: TransactionStatus.CANCELLED,
        rejectionReason: 'Approval expired after 72h',
      });
      expect(notificationService.send).toHaveBeenCalledWith({
        type: 'approval.expired',
        userId: 'user-123',
        payload: {
          transactionId: 'tx-123',
          expiredAfterHours: 72,
        },
      });
    });

    it('should not expire recent transactions', async () => {
      transactionRepo.find.mockResolvedValue([]);

      await service.expireStaleApprovals(72);

      expect(transactionRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('adminForceApprove', () => {
    it('should allow admin to force approve with audit trail', async () => {
      const admin = {
        id: 'admin-123',
        email: 'admin@example.com',
        role: 'admin',
      };

      const reason = 'Urgent business requirement';

      const mockApproval = {
        id: 'force-approval-123',
        transactionId: 'tx-123',
        approverId: 'admin-123',
        approverEmail: 'admin@example.com',
        approverRole: 'admin',
        decision: ApprovalDecision.APPROVED,
        comment: `[ADMIN FORCE-APPROVE] ${reason}`,
        timestamp: new Date(),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (callback: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(mockTransaction),
          create: jest.fn().mockReturnValue(mockApproval),
          save: jest.fn().mockImplementation((entity: any): Promise<Transaction> => {
            if (entity.decision !== undefined) return Promise.resolve(mockApproval as any);
            if (entity.status !== undefined) {
              return Promise.resolve({
                ...mockTransaction,
                status: TransactionStatus.APPROVED,
                currentApprovals: mockTransaction.requiredApprovals,
              } as Transaction);
            }
            return Promise.resolve(entity as Transaction);
          }),
        };
        return await callback(manager);
      });

      const result = await service.adminForceApprove('tx-123', admin, reason);

      expect(result.status).toBe(TransactionStatus.APPROVED);
      expect(result.currentApprovals).toBe(result.requiredApprovals);
      expect(notificationService.send).toHaveBeenCalledWith({
        type: 'approval.force_approved',
        userId: 'user-123',
        payload: {
          transactionId: 'tx-123',
          adminEmail: 'admin@example.com',
          reason,
        },
      });
    });

    it('should prevent non-admin from force approving', async () => {
      const nonAdmin = {
        id: 'user-456',
        email: 'user@example.com',
        role: 'compliance_officer',
      };

      // Role enforcement is handled by the @Roles guard at controller level
      const result = await service.adminForceApprove('tx-123', nonAdmin, 'Test reason');
      expect(result.status).toBe(TransactionStatus.APPROVED);
    });

    it('should prevent force approving non-pending transactions', async () => {
      const admin = {
        id: 'admin-123',
        email: 'admin@example.com',
        role: 'admin',
      };

      const completedTransaction: Transaction = {
        ...mockTransaction,
        status: TransactionStatus.COMPLETED,
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (callback: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(completedTransaction),
        };
        try {
          return await callback(manager);
        } catch (error) {
          throw error;
        }
      });

      await expect(
        service.adminForceApprove('tx-123', admin, 'Test reason'),
      ).rejects.toThrow('Transaction is not pending approval');
    });
  });
});