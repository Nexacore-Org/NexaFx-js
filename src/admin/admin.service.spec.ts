import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuditService } from '../audit/audit.service';
import { User, UserRole, KycStatus } from '../users/user.entity';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { KycDocument } from '../kyc/kyc-document.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import { WebhookEndpoint } from '../webhooks/webhook-endpoint.entity';
import { AmlAlert } from '../aml/aml-alert.entity';

const mockRepository = () => ({
  count: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
});

const mockAuditService = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

describe('AdminService', () => {
  let service: AdminService;
  let usersRepo: ReturnType<typeof mockRepository>;
  let transactionsRepo: ReturnType<typeof mockRepository>;
  let auditService: ReturnType<typeof mockAuditService>;

  const adminUserId = 'admin-uuid-001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useFactory: mockRepository },
        { provide: getRepositoryToken(Transaction), useFactory: mockRepository },
        { provide: getRepositoryToken(KycDocument), useFactory: mockRepository },
        { provide: getRepositoryToken(SupportTicket), useFactory: mockRepository },
        { provide: getRepositoryToken(WebhookEndpoint), useFactory: mockRepository },
        { provide: getRepositoryToken(AmlAlert), useFactory: mockRepository },
        { provide: AuditService, useFactory: mockAuditService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    usersRepo = module.get(getRepositoryToken(User));
    transactionsRepo = module.get(getRepositoryToken(Transaction));
    auditService = module.get(AuditService);
  });

  describe('overrideTransactionStatus', () => {
    const mockTransaction: Partial<Transaction> = {
      id: 'tx-001',
      status: TransactionStatus.PENDING,
      amount: 100,
      currency: 'USD',
      senderId: 'sender-001',
      receiverId: 'receiver-001',
      reference: 'REF-001',
    };

    it('should update status and log before/after diff', async () => {
      const updated = { ...mockTransaction, status: TransactionStatus.COMPLETED };
      transactionsRepo.findOne.mockResolvedValue({ ...mockTransaction });
      transactionsRepo.save.mockResolvedValue(updated);

      const result = await service.overrideTransactionStatus(
        'tx-001',
        TransactionStatus.COMPLETED,
        adminUserId,
        'Payment confirmed manually',
      );

      expect(result.status).toBe(TransactionStatus.COMPLETED);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: adminUserId,
          action: 'admin.transaction.status_override',
          entityType: 'transaction',
          entityId: 'tx-001',
          before: expect.objectContaining({ status: TransactionStatus.PENDING }),
          after: expect.objectContaining({ status: TransactionStatus.COMPLETED }),
          reason: 'Payment confirmed manually',
        }),
      );
    });

    it('should throw NotFoundException when transaction does not exist', async () => {
      transactionsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.overrideTransactionStatus(
          'nonexistent',
          TransactionStatus.COMPLETED,
          adminUserId,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should log without reason when reason is omitted', async () => {
      const updated = { ...mockTransaction, status: TransactionStatus.FAILED };
      transactionsRepo.findOne.mockResolvedValue({ ...mockTransaction });
      transactionsRepo.save.mockResolvedValue(updated);

      await service.overrideTransactionStatus(
        'tx-001',
        TransactionStatus.FAILED,
        adminUserId,
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ reason: undefined }),
      );
    });
  });

  describe('updateUserStatus', () => {
    const mockUser: Partial<User> = {
      id: 'user-001',
      email: 'user@example.com',
      isActive: true,
      role: UserRole.USER,
      kycStatus: KycStatus.APPROVED,
    };

    it('should suspend user and log before/after diff', async () => {
      const updated = { ...mockUser, isActive: false };
      usersRepo.findOne.mockResolvedValue({ ...mockUser });
      usersRepo.save.mockResolvedValue(updated);

      const result = await service.updateUserStatus(
        'user-001',
        false,
        adminUserId,
        'Suspicious activity detected',
      );

      expect(result.isActive).toBe(false);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: adminUserId,
          action: 'admin.user.suspended',
          entityType: 'user',
          entityId: 'user-001',
          before: expect.objectContaining({ isActive: true }),
          after: expect.objectContaining({ isActive: false }),
          reason: 'Suspicious activity detected',
        }),
      );
    });

    it('should activate user and use activated action', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      const updated = { ...mockUser, isActive: true };
      usersRepo.findOne.mockResolvedValue({ ...inactiveUser });
      usersRepo.save.mockResolvedValue(updated);

      await service.updateUserStatus('user-001', true, adminUserId, 'Appeal approved');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'admin.user.activated' }),
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateUserStatus('nonexistent', false, adminUserId),
      ).rejects.toThrow(NotFoundException);

      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('updateUserRole', () => {
    const mockUser: Partial<User> = {
      id: 'user-001',
      email: 'user@example.com',
      isActive: true,
      role: UserRole.USER,
      kycStatus: KycStatus.APPROVED,
    };

    it('should change role and log before/after diff', async () => {
      const updated = { ...mockUser, role: UserRole.COMPLIANCE };
      usersRepo.findOne.mockResolvedValue({ ...mockUser });
      usersRepo.save.mockResolvedValue(updated);

      const result = await service.updateUserRole(
        'user-001',
        UserRole.COMPLIANCE,
        adminUserId,
        'Promoted to compliance team',
      );

      expect(result.role).toBe(UserRole.COMPLIANCE);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: adminUserId,
          action: 'admin.user.role_changed',
          entityType: 'user',
          entityId: 'user-001',
          before: expect.objectContaining({ role: UserRole.USER }),
          after: expect.objectContaining({ role: UserRole.COMPLIANCE }),
          reason: 'Promoted to compliance team',
        }),
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateUserRole('nonexistent', UserRole.ADMIN, adminUserId),
      ).rejects.toThrow(NotFoundException);

      expect(auditService.log).not.toHaveBeenCalled();
    });
  });
});
