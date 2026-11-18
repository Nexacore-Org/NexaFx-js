import { NotFoundException } from '@nestjs/common';
import { AdminController } from '../../admin/admin.controller';
import { AdminExportsController } from '../../admin/exports/admin-exports.controller';
import { ApiKeysController } from '../api-keys/controllers/api-keys.controller';
import { SessionsController } from '../sessions/sessions.controller';
import { AuditAction } from './audit-actions';
import { Role } from '../../auth/enums/role.enum';

/** Issue #1533: one audited action per previously silent sensitive operation. */
describe('sensitive actions write audit entries (issue #1533)', () => {
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  beforeEach(() => audit.log.mockClear());

  describe('exports', () => {
    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJob: jest.fn(),
    };
    const storage = { resolve: jest.fn().mockReturnValue('/tmp/x.csv'), exists: jest.fn().mockReturnValue(true) };
    const controller = new AdminExportsController(queue as any, storage as any, audit as any);
    const dto = { from: '2026-01-01', to: '2026-01-31', format: 'csv' } as any;

    it('audits creation and records who asked in the job data', async () => {
      await controller.createExport(dto, 'a@b.c', 'admin-1');

      expect(queue.add).toHaveBeenCalledWith('export-transactions', expect.objectContaining({ requestedBy: 'admin-1' }));
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-1', action: AuditAction.ADMIN_EXPORT_CREATED, entityId: 'job-1' }),
      );
    });

    it('audits downloads', async () => {
      const res = { download: jest.fn() };
      await controller.download('job-1', 'tok', 'admin-1', res as any);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.ADMIN_EXPORT_DOWNLOADED, entityId: 'job-1' }),
      );
      expect(res.download).toHaveBeenCalled();
    });

    it('lets only the requester (or compliance) read a job', async () => {
      const job = { data: { requestedBy: 'admin-1' }, getState: jest.fn().mockResolvedValue('completed'), returnvalue: {} };
      queue.getJob.mockResolvedValue(job);

      await expect(controller.getStatus('job-1', 'admin-1', Role.ADMIN)).resolves.toMatchObject({ status: 'completed' });
      await expect(controller.getStatus('job-1', 'admin-2', Role.ADMIN)).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.getStatus('job-1', 'admin-2', Role.COMPLIANCE)).resolves.toMatchObject({ status: 'completed' });
    });
  });

  describe('API keys', () => {
    it('audits create and revoke without ever logging the key', async () => {
      const service = {
        createApiKey: jest.fn().mockResolvedValue({
          apiKey: { id: 'k1', name: 'ci', scopes: ['read:balances'], rateLimit: 100, expiresAt: null },
          plainKey: 'nxf_SECRET_KEY_VALUE',
        }),
        revokeApiKey: jest.fn().mockResolvedValue({ id: 'k1' }),
      };
      const controller = new ApiKeysController(service as any, audit as any);

      await controller.create({ name: 'ci' } as any, { user: { id: 'u1', role: 'user' } });
      await controller.revoke('k1', { user: { id: 'u1' } });

      const actions = audit.log.mock.calls.map((c) => c[0].action);
      expect(actions).toEqual([AuditAction.API_KEY_CREATED, AuditAction.API_KEY_REVOKED]);
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('nxf_SECRET_KEY_VALUE');
    });
  });

  describe('sessions', () => {
    it('audits revoking one session and all other sessions', async () => {
      const tokens = { revokeToken: jest.fn().mockResolvedValue(true), revokeAllExcept: jest.fn().mockResolvedValue(3) };
      const controller = new SessionsController(tokens as any, audit as any);
      const req = { user: { sub: 'u1', sid: 'cur' } };

      await controller.revokeSession('s2', req);
      await controller.revokeAllSessions(req);

      expect(audit.log).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: AuditAction.SESSION_REVOKED, entityId: 's2' }));
      expect(audit.log).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ action: AuditAction.SESSIONS_REVOKED_ALL, after: { revokedCount: 3, keptSessionId: 'cur' } }),
      );
    });
  });

  describe('KYC documents', () => {
    it('records the admin, the document owner and the file before sending it', async () => {
      const order: string[] = [];
      const adminService = {
        recordKycFileView: jest.fn(async () => {
          order.push('audit');
        }),
      };
      const controller = new AdminController(adminService as any);
      const res = { sendFile: jest.fn(() => order.push('send')) };

      await controller.serveKycFile('user-9', 'v1', 'passport.png', 'admin-1', res as any);

      expect(adminService.recordKycFileView).toHaveBeenCalledWith('admin-1', 'user-9', 'v1', 'passport.png');
      expect(order).toEqual(['audit', 'send']);
    });
  });
});
