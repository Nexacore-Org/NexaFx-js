import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TransactionApprovalService } from './transaction-approval.service';
import { Transaction, TransactionStatus } from '../entities/transaction.entity';
import { TransactionApproval, ApprovalDecision } from '../entities/transaction-approval.entity';

const mockTransactionRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
});

const mockApprovalRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
});

const buildMockTransaction = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: 'txn-uuid-001',
    userId: 'user-uuid-owner',
    amount: 15000,
    currency: 'USD',
    status: TransactionStatus.PENDING_APPROVAL,
    requiredApprovals: 2,
    currentApprovals: 0,
    requiresApproval: true,
    approvals: [],
    ...overrides,
  } as Transaction);

const buildApprover = (id = 'approver-uuid-001') => ({
  id,
  email: `${id}@nexafx.com`,
  role: 'compliance_officer',
});

describe('TransactionApprovalService', () => {
  let service: TransactionApprovalService;
  let transactionRepo: ReturnType<typeof mockTransactionRepo>;
  let approvalRepo: ReturnType<typeof mockApprovalRepo>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    // DataSource mock that executes the callback with a manager mock
    const buildManager = (transaction: Transaction | null, existingApproval: TransactionApproval | null = null) => ({
      findOne: jest.fn().mockResolvedValue(transaction),
      create: jest.fn().mockImplementation((_, data) => data),
      save: jest.fn().mockImplementation((_, entity) => Promise.resolve({ id: 'approval-uuid', ...entity })),
    });

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(buildManager(buildMockTransaction()))),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionApprovalService,
        { provide: getRepositoryToken(Transaction), useFactory: mockTransactionRepo },
        { provide: getRepositoryToken(TransactionApproval), useFactory: mockApprovalRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<TransactionApprovalService>(TransactionApprovalService);
    transactionRepo = module.get(getRepositoryToken(Transaction));
    approvalRepo = module.get(getRepositoryToken(TransactionApproval));
  });

  // ─── requiresApproval ────────────────────────────────────────────────────────

  describe('requiresApproval()', () => {
    it('returns true when amount meets USD threshold', () => {
      expect(service.requiresApproval(10000, 'USD')).toBe(true);
    });

    it('returns false when amount is below USD threshold', () => {
      expect(service.requiresApproval(9999, 'USD')).toBe(false);
    });

    it('returns true for BTC at 0.5 threshold', () => {
      expect(service.requiresApproval(0.5, 'BTC')).toBe(true);
    });

    it('returns false for BTC below threshold', () => {
      expect(service.requiresApproval(0.49, 'BTC')).toBe(false);
    });

    it('uses wildcard threshold for unknown currency', () => {
      expect(service.requiresApproval(10000, 'XYZ')).toBe(true);
    });
  });

  // ─── getRequiredApprovals ─────────────────────────────────────────────────────

  describe('getRequiredApprovals()', () => {
    it('returns 2 for standard high-value USD transaction', () => {
      expect(service.getRequiredApprovals(15000, 'USD')).toBe(2);
    });

    it('returns 3 for very high-value transaction (>=50k)', () => {
      expect(service.getRequiredApprovals(50000, 'USD')).toBe(3);
    });

    it('returns 3 for BTC', () => {
      expect(service.getRequiredApprovals(1, 'BTC')).toBe(3);
    });
  });

  // ─── markPendingApproval ──────────────────────────────────────────────────────

  describe('markPendingApproval()', () => {
    it('sets status to PENDING_APPROVAL and saves', async () => {
      const txn = buildMockTransaction({ status: TransactionStatus.PENDING });
      transactionRepo.save.mockResolvedValue({ ...txn, status: TransactionStatus.PENDING_APPROVAL });

      const result = await service.markPendingApproval(txn);

      expect(result.status).toBe(TransactionStatus.PENDING_APPROVAL);
      expect(result.requiredApprovals).toBeGreaterThan(0);
      expect(transactionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: TransactionStatus.PENDING_APPROVAL }),
      );
    });
  });

  // ─── approveTransaction ───────────────────────────────────────────────────────

  describe('approveTransaction()', () => {
    it('records approval and increments count (partial quorum)', async () => {
      const txn = buildMockTransaction({ currentApprovals: 0, requiredApprovals: 2 });
      const manager = buildManagerWith(txn, null);
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      const result = await service.approveTransaction(
        txn.id,
        buildApprover(),
        { comment: 'Looks good' },
      );

      expect(result.approval.decision).toBe(ApprovalDecision.APPROVED);
      expect(result.transaction.currentApprovals).toBe(1);
      expect(result.transaction.status).toBe(TransactionStatus.PENDING_APPROVAL);
    });

    it('sets status APPROVED when quorum is reached', async () => {
      const txn = buildMockTransaction({ currentApprovals: 1, requiredApprovals: 2 });
      const manager = buildManagerWith(txn, null);
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      const result = await service.approveTransaction(
        txn.id,
        buildApprover(),
        {},
      );

      expect(result.transaction.status).toBe(TransactionStatus.APPROVED);
      expect(result.transaction.currentApprovals).toBe(2);
    });

    it('throws NotFoundException when transaction does not exist', async () => {
      const manager = buildManagerWith(null, null);
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      await expect(
        service.approveTransaction('non-existent', buildApprover(), {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if not PENDING_APPROVAL', async () => {
      const txn = buildMockTransaction({ status: TransactionStatus.APPROVED });
      const manager = buildManagerWith(txn, null);
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      await expect(
        service.approveTransaction(txn.id, buildApprover(), {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if approver already actioned this transaction', async () => {
      const txn = buildMockTransaction();
      const approverId = 'approver-uuid-001';
      const existingApproval: Partial<TransactionApproval> = {
        decision: ApprovalDecision.APPROVED,
      };
      const manager = buildManagerWithExistingApproval(txn, existingApproval as TransactionApproval);
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      await expect(
        service.approveTransaction(txn.id, buildApprover(approverId), {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if transaction owner tries to approve', async () => {
      const ownerId = 'user-uuid-owner';
      const txn = buildMockTransaction({ userId: ownerId });
      const manager = buildManagerWith(txn, null);
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      await expect(
        service.approveTransaction(txn.id, buildApprover(ownerId), {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── rejectTransaction ────────────────────────────────────────────────────────

  describe('rejectTransaction()', () => {
    it('immediately sets status to REJECTED on any rejection', async () => {
      const txn = buildMockTransaction({ currentApprovals: 1, requiredApprovals: 2 });
      const manager = buildManagerWith(txn, null);
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      const result = await service.rejectTransaction(
        txn.id,
        buildApprover('approver-uuid-002'),
        { comment: 'Policy violation' },
      );

      expect(result.transaction.status).toBe(TransactionStatus.REJECTED);
      expect(result.approval.decision).toBe(ApprovalDecision.REJECTED);
    });

    it('stores rejection reason on transaction', async () => {
      const txn = buildMockTransaction();
      const manager = buildManagerWith(txn, null);
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      const result = await service.rejectTransaction(
        txn.id,
        buildApprover(),
        { comment: 'Suspicious activity' },
      );

      expect(result.transaction.rejectionReason).toBe('Suspicious activity');
    });

    it('throws ForbiddenException if transaction owner tries to reject', async () => {
      const ownerId = 'user-uuid-owner';
      const txn = buildMockTransaction({ userId: ownerId });
      const manager = buildManagerWith(txn, null);
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      await expect(
        service.rejectTransaction(txn.id, buildApprover(ownerId), {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── getApprovals ─────────────────────────────────────────────────────────────

  describe('getApprovals()', () => {
    it('returns list of approvals for a transaction', async () => {
      transactionRepo.findOne.mockResolvedValue(buildMockTransaction());
      approvalRepo.find.mockResolvedValue([
        { id: 'a1', decision: ApprovalDecision.APPROVED },
        { id: 'a2', decision: ApprovalDecision.APPROVED },
      ]);

      const approvals = await service.getApprovals('txn-uuid-001');

      expect(approvals).toHaveLength(2);
      expect(approvalRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { transactionId: 'txn-uuid-001' } }),
      );
    });

    it('throws NotFoundException for unknown transaction', async () => {
      transactionRepo.findOne.mockResolvedValue(null);

      await expect(service.getApprovals('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});

// ─── Test helpers ─────────────────────────────────────────────────────────────

function buildManagerWith(
  transaction: Transaction | null,
  existingApproval: TransactionApproval | null,
) {
  const approvalFindOne = jest.fn().mockResolvedValue(existingApproval);
  return {
    findOne: jest.fn().mockImplementation((entity: any) => {
      if (entity === Transaction) return Promise.resolve(transaction);
      if (entity === TransactionApproval) return approvalFindOne();
      return Promise.resolve(null);
    }),
    create: jest.fn().mockImplementation((_, data) => data),
    save: jest.fn().mockImplementation((_, entity) => {
      if (entity && entity.status !== undefined) {
        return Promise.resolve({ ...entity });
      }
      return Promise.resolve({ id: 'approval-uuid', ...entity });
    }),
  };
}

function buildManagerWithExistingApproval(
  transaction: Transaction | null,
  existingApproval: TransactionApproval,
) {
  return {
    findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
      if (entity === Transaction) return Promise.resolve(transaction);
      if (entity === TransactionApproval) return Promise.resolve(existingApproval);
      return Promise.resolve(null);
    }),
    create: jest.fn().mockImplementation((_, data) => data),
    save: jest.fn().mockResolvedValue({}),
  };
}
