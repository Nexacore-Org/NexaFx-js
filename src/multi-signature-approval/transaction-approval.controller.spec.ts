import { Test, TestingModule } from '@nestjs/testing';
import { TransactionApprovalController } from './transaction-approval.controller';
import { TransactionApprovalService } from './transaction-approval.service';
import { Transaction, TransactionStatus } from '../entities/transaction.entity';
import { TransactionApproval, ApprovalDecision } from '../entities/transaction-approval.entity';

const mockService = () => ({
  approveTransaction: jest.fn(),
  rejectTransaction: jest.fn(),
  getApprovals: jest.fn(),
  getPendingApprovalTransactions: jest.fn(),
});

const makeUser = (id = 'approver-001') => ({
  id,
  email: `${id}@nexafx.com`,
  role: 'compliance_officer',
});

const makeTxn = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: 'txn-001',
    userId: 'owner-001',
    currentApprovals: 1,
    requiredApprovals: 2,
    status: TransactionStatus.PENDING_APPROVAL,
    ...overrides,
  } as Transaction);

const makeApproval = (decision: ApprovalDecision): TransactionApproval =>
  ({
    id: 'approval-001',
    transactionId: 'txn-001',
    approverId: 'approver-001',
    decision,
    timestamp: new Date(),
  } as TransactionApproval);

describe('TransactionApprovalController', () => {
  let controller: TransactionApprovalController;
  let service: ReturnType<typeof mockService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionApprovalController],
      providers: [{ provide: TransactionApprovalService, useFactory: mockService }],
    }).compile();

    controller = module.get(TransactionApprovalController);
    service = module.get(TransactionApprovalService);
  });

  describe('approve()', () => {
    it('returns approval summary on partial quorum', async () => {
      const txn = makeTxn({ currentApprovals: 1, status: TransactionStatus.PENDING_APPROVAL });
      const approval = makeApproval(ApprovalDecision.APPROVED);
      service.approveTransaction.mockResolvedValue({ transaction: txn, approval });

      const result = await controller.approve('txn-001', {}, makeUser());

      expect(result.transactionStatus).toBe(TransactionStatus.PENDING_APPROVAL);
      expect(result.currentApprovals).toBe(1);
      expect(result.decision).toBe(ApprovalDecision.APPROVED);
      expect(service.approveTransaction).toHaveBeenCalledWith(
        'txn-001',
        makeUser(),
        {},
      );
    });

    it('message indicates fully approved when quorum reached', async () => {
      const txn = makeTxn({ currentApprovals: 2, status: TransactionStatus.APPROVED });
      const approval = makeApproval(ApprovalDecision.APPROVED);
      service.approveTransaction.mockResolvedValue({ transaction: txn, approval });

      const result = await controller.approve('txn-001', {}, makeUser());

      expect(result.message).toContain('fully approved');
    });
  });

  describe('reject()', () => {
    it('returns rejection summary', async () => {
      const txn = makeTxn({ status: TransactionStatus.REJECTED, rejectionReason: 'Fraud' });
      const approval = makeApproval(ApprovalDecision.REJECTED);
      service.rejectTransaction.mockResolvedValue({ transaction: txn, approval });

      const result = await controller.reject('txn-001', { comment: 'Fraud' }, makeUser());

      expect(result.transactionStatus).toBe(TransactionStatus.REJECTED);
      expect(result.rejectionReason).toBe('Fraud');
      expect(result.decision).toBe(ApprovalDecision.REJECTED);
    });
  });

  describe('getApprovals()', () => {
    it('returns approval list', async () => {
      const approvals = [makeApproval(ApprovalDecision.APPROVED)];
      service.getApprovals.mockResolvedValue(approvals);

      const result = await controller.getApprovals('txn-001');

      expect(result.transactionId).toBe('txn-001');
      expect(result.approvals).toHaveLength(1);
    });
  });

  describe('getPendingApprovals()', () => {
    it('returns count and list of pending transactions', async () => {
      const txns = [makeTxn(), makeTxn({ id: 'txn-002' })];
      service.getPendingApprovalTransactions.mockResolvedValue(txns);

      const result = await controller.getPendingApprovals();

      expect(result.count).toBe(2);
      expect(result.transactions).toHaveLength(2);
    });
  });
});
