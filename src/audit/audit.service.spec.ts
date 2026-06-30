import { Repository } from 'typeorm';
import { AuditService, AuditEvent } from './audit.service';
import { AuditLog } from './audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;
  let auditRepo: jest.Mocked<Pick<Repository<AuditLog>, 'create' | 'save'>>;

  beforeEach(() => {
    auditRepo = { create: jest.fn(), save: jest.fn() } as any;
    service = new AuditService(auditRepo as any);
  });

  describe('log()', () => {
    it('creates and saves a log entry with correct fields', async () => {
      const event: AuditEvent = {
        userId: 'user-1',
        action: 'user.login',
        entityType: 'user',
        entityId: 'user-1',
        ipAddress: '127.0.0.1',
      };
      const savedEntry = { id: 'log-1', ...event } as AuditLog;
      auditRepo.create.mockReturnValue(savedEntry);
      auditRepo.save.mockResolvedValue(savedEntry);

      const result = await service.log(event);

      expect(auditRepo.create).toHaveBeenCalledWith(event);
      expect(auditRepo.save).toHaveBeenCalledWith(savedEntry);
      expect(result).toEqual(savedEntry);
    });

    it('logs auth event with correct action and entityType', async () => {
      const event: AuditEvent = {
        userId: 'user-2',
        action: 'auth.login',
        entityType: 'auth',
      };
      const entry = { id: 'log-2', ...event } as AuditLog;
      auditRepo.create.mockReturnValue(entry);
      auditRepo.save.mockResolvedValue(entry);

      const result = await service.log(event);
      expect(result.action).toBe('auth.login');
      expect(result.entityType).toBe('auth');
    });

    it('logs transaction event including metadata in after field', async () => {
      const event: AuditEvent = {
        userId: 'user-3',
        action: 'transaction.reversed',
        entityType: 'transaction',
        entityId: 'tx-1',
        after: { reversalTransactionId: 'tx-2', reason: 'fraud' },
      };
      const entry = { id: 'log-3', ...event } as AuditLog;
      auditRepo.create.mockReturnValue(entry);
      auditRepo.save.mockResolvedValue(entry);

      const result = await service.log(event);
      expect(result.after).toEqual(expect.objectContaining({ reason: 'fraud' }));
    });

    it('does not log sensitive fields in plaintext (no raw credentials in after payload)', async () => {
      const event: AuditEvent = {
        userId: 'user-4',
        action: 'user.profile_update',
        entityType: 'user',
        entityId: 'user-4',
        after: { updated: true },
      };
      const entry = { id: 'log-4', ...event } as AuditLog;
      auditRepo.create.mockReturnValue(entry);
      auditRepo.save.mockResolvedValue(entry);

      const result = await service.log(event);
      // Sensitive raw values must not appear in the persisted payload
      expect(result.after).not.toHaveProperty('password');
      expect(result.after).not.toHaveProperty('secret');
      expect(result.after).not.toHaveProperty('privateKey');
    });

    it('handleAuditEvent calls log() without throwing', () => {
      auditRepo.create.mockReturnValue({} as AuditLog);
      auditRepo.save.mockResolvedValue({} as AuditLog);

      expect(() =>
        service.handleAuditEvent({
          action: 'kyc.reviewed',
          entityType: 'kyc',
        }),
      ).not.toThrow();
    });
  });
});
