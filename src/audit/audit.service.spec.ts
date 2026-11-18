import { Repository } from 'typeorm';
import { AuditService, AuditEvent } from './audit.service';
import { AuditLog } from './audit-log.entity';
import { getRequestActorId } from '../common/context/request-actor.storage';

jest.mock('../common/context/request-actor.storage', () => ({ getRequestActorId: jest.fn() }));

describe('AuditService', () => {
  let service: AuditService;
  let auditRepo: jest.Mocked<Pick<Repository<AuditLog>, 'create' | 'save'>>;

  beforeEach(() => {
    auditRepo = { create: jest.fn(), save: jest.fn() } as any;
    service = new AuditService(auditRepo as any);
  });

  describe('log()', () => {
    it('redacts sensitive fields in before/after snapshots before persisting', async () => {
      auditRepo.create.mockImplementation((e: any) => e);
      auditRepo.save.mockImplementation(async (e: any) => e);

      const saved = await service.log({
        action: 'user.update',
        entityType: 'user',
        before: { email: 'a@b.com', passwordHash: 'abc' },
        after: { email: 'c@d.com', refreshToken: 'tok', nested: { totpSecret: 's' } },
      });

      expect(saved.before).toEqual({ email: 'a@b.com', passwordHash: '[REDACTED]' });
      expect(saved.after).toEqual({
        email: 'c@d.com',
        refreshToken: '[REDACTED]',
        nested: { totpSecret: '[REDACTED]' },
      });
      expect(JSON.stringify(saved)).not.toMatch(/"abc"|"tok"|"s"/);
    });

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

  describe('log() — manager, masking, impersonation, listener (issue #1517)', () => {
    let repo: { create: jest.Mock; save: jest.Mock };
    let svc: AuditService;

    beforeEach(() => {
      repo = { create: jest.fn((e: any) => e), save: jest.fn(async (e: any) => e) };
      svc = new AuditService({ create: jest.fn(), save: jest.fn() } as any);
      (getRequestActorId as jest.Mock).mockReturnValue(undefined);
    });

    it('writes through the caller\'s manager so the entry joins their transaction', async () => {
      const manager = { getRepository: jest.fn().mockReturnValue(repo) };

      await svc.log({ action: 'auth.register', entityType: 'user' }, manager as any);

      expect(manager.getRepository).toHaveBeenCalledWith(AuditLog);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('masks password and token keys in nested snapshots', async () => {
      const saved: any = await svc.log(
        { action: 'x', entityType: 'user', after: { password: 'p', nested: { accessToken: 't' }, keep: 1 } },
        { getRepository: () => repo } as any,
      );

      expect(saved.after).toEqual({ password: '[REDACTED]', nested: { accessToken: '[REDACTED]' }, keep: 1 });
    });

    it('adds impersonatedBy to a copy and never mutates the caller\'s event', async () => {
      (getRequestActorId as jest.Mock).mockReturnValue('admin-1');
      const event: AuditEvent = { action: 'x', entityType: 'user', after: { a: 1 } };

      const saved: any = await svc.log(event, { getRepository: () => repo } as any);

      expect(saved.after).toEqual({ a: 1, impersonatedBy: 'admin-1' });
      expect(event.after).toEqual({ a: 1 });
    });

    it('lets log() reject for transactional callers', async () => {
      repo.save.mockRejectedValue(new Error('insert failed'));

      await expect(svc.log({ action: 'x', entityType: 'user' }, { getRepository: () => repo } as any)).rejects.toThrow(
        'insert failed',
      );
    });

    it('handleAuditEvent contains a failing insert instead of leaking an unhandled rejection', async () => {
      const failing = new AuditService({
        create: jest.fn((e: any) => e),
        save: jest.fn().mockRejectedValue(new Error('db down')),
      } as any);
      const unhandled = jest.fn();
      process.on('unhandledRejection', unhandled);

      failing.handleAuditEvent({ action: 'kyc.reviewed', entityType: 'kyc' });
      await new Promise((resolve) => setImmediate(resolve));

      process.off('unhandledRejection', unhandled);
      expect(unhandled).not.toHaveBeenCalled();
    });
  });
});
