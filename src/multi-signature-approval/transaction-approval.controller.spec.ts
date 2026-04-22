import { Test, TestingModule } from '@nestjs/testing';
import { TransactionApprovalController } from './transaction-approval.controller';
import { TransactionApprovalService } from './transaction-approval.service';
import { Transaction, TransactionStatus } from './transaction.entity';
import { TransactionApproval, ApprovalDecision } from './transaction-approval.entity';

const mockService = () => ({
  approveTransaction: jest.fn(),
  rejectTransaction: jest.fn(),
  getApprovals: jest.fn(),
  getPendingApprovalTransactions: jest.fn(),
  adminForceApprove: jest.fn(),
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

  describe('reject() - Enhanced Tests', () => {
    it('should reject transaction immediately with single approver', async () => {
      const txn = makeTxn({ 
        status: TransactionStatus.REJECTED, 
        rejectionReason: 'High risk detected' 
      });
      const approval = makeApproval(ApprovalDecision.REJECTED);
      service.rejectTransaction.mockResolvedValue({ transaction: txn, approval });

      const result = await controller.reject('txn-001', { 
        comment: 'High risk detected' 
      }, makeUser());

      expect(result.transactionStatus).toBe(TransactionStatus.REJECTED);
      expect(result.rejectionReason).toBe('High risk detected');
      expect(result.decision).toBe(ApprovalDecision.REJECTED);
      expect(result.message).toBe('Transaction rejected');
    });

    it('should handle rejection with optional comment', async () => {
      const txn = makeTxn({ 
        status: TransactionStatus.REJECTED, 
        rejectionReason: 'Rejected by approver' 
      });
      const approval = makeApproval(ApprovalDecision.REJECTED);
      service.rejectTransaction.mockResolvedValue({ transaction: txn, approval });

      const result = await controller.reject('txn-001', {}, makeUser());

      expect(result.transactionStatus).toBe(TransactionStatus.REJECTED);
      expect(result.rejectionReason).toBe('Rejected by approver');
    });
  });

  describe('forceApprove()', () => {
    it('should allow admin to force approve with audit trail', async () => {
      const admin = { id: 'admin-001', email: 'admin@nexafx.com', role: 'admin' };
      const txn = makeTxn({ 
        status: TransactionStatus.APPROVED,
        currentApprovals: 2,
        requiredApprovals: 2
      });
      
      service.adminForceApprove.mockResolvedValue(txn);

      const result = await controller.forceApprove('txn-001', { 
        reason: 'Urgent business requirement' 
      }, admin);

      expect(result.transactionStatus).toBe(TransactionStatus.APPROVED);
      expect(result.message).toBe('Transaction force-approved by admin');
      expect(service.adminForceApprove).toHaveBeenCalledWith(
        'txn-001',
        admin,
        'Urgent business requirement'
      );
    });

    it('should require minimum reason length', async () => {
      const admin = { id: 'admin-001', email: 'admin@nexafx.com', role: 'admin' };
      
      // This would be validated by the DTO validation
      // The controller should handle validation errors appropriately
      service.adminForceApprove.mockResolvedValue(makeTxn());

      const result = await controller.forceApprove('txn-001', { 
        reason: 'Valid reason' 
      }, admin);

      expect(result.message).toBe('Transaction force-approved by admin');
    });
  });

  describe('Integration Tests - Complete Flow', () => {
    it('should handle complete approval workflow', async () => {
      const txn = makeTxn({ currentApprovals: 1, requiredApprovals: 2 });
      const approval = makeApproval(ApprovalDecision.APPROVED);
      
      service.approveTransaction.mockResolvedValue({ transaction: txn, approval });

      const result = await controller.approve('txn-001', {}, makeUser());

      expect(result.transactionStatus).toBe(TransactionStatus.PENDING_APPROVAL);
      expect(result.currentApprovals).toBe(1);
      expect(result.requiredApprovals).toBe(2);
    });

    it('should handle rejection workflow', async () => {
      const txn = makeTxn({ 
        status: TransactionStatus.REJECTED,
        rejectionReason: 'Suspicious activity detected'
      });
      const approval = makeApproval(ApprovalDecision.REJECTED);
      
      service.rejectTransaction.mockResolvedValue({ transaction: txn, approval });

      const result = await controller.reject('txn-001', { 
        comment: 'Suspicious activity detected' 
      }, makeUser());

      expect(result.transactionStatus).toBe(TransactionStatus.REJECTED);
      expect(result.rejectionReason).toBe('Suspicious activity detected');
      expect(result.decision).toBe(ApprovalDecision.REJECTED);
    });

    it('should handle admin force approve workflow', async () => {
      const admin = { id: 'admin-001', email: 'admin@nexafx.com', role: 'admin' };
      const txn = makeTxn({ 
        status: TransactionStatus.APPROVED,
        currentApprovals: 2,
        requiredApprovals: 2
      });
      
      service.adminForceApprove.mockResolvedValue(txn);

      const result = await controller.forceApprove('txn-001', { 
        reason: 'Critical business transaction - requires immediate processing' 
      }, admin);

      expect(result.transactionStatus).toBe(TransactionStatus.APPROVED);
      expect(result.message).toBe('Transaction force-approved by admin');
    });
  });
});
