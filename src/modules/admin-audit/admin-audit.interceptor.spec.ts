import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AuditAction } from './audit-actions';
import { SKIP_AUDIT_KEY } from './decorators/skip-audit.decorator';

/** Issue #1533 */
function build(opts: { skip?: boolean; url?: string; type?: string; auditFails?: boolean } = {}) {
  const request: any = {
    method: 'PATCH',
    originalUrl: opts.url ?? '/api/v1/admin/users/u1/status?token=SECRET',
    route: { path: '/api/v1/admin/users/:id/status' },
    params: { id: 'u1' },
    body: { isActive: false, password: 'hunter2', email: 'a@b.com' },
    user: { id: 'admin-1' },
  };
  const context = {
    getType: () => opts.type ?? 'http',
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => (key === SKIP_AUDIT_KEY ? !!opts.skip : undefined)),
  };
  const audit = { log: jest.fn(() => (opts.auditFails ? Promise.reject(new Error('db down')) : Promise.resolve({}))) };
  const interceptor = new AdminAuditInterceptor(reflector as any, audit as any);
  return { interceptor, context, audit };
}

const run = async (interceptor: AdminAuditInterceptor, context: ExecutionContext, handler: CallHandler) =>
  new Promise((resolve) => {
    interceptor.intercept(context, handler).subscribe({ next: resolve, error: resolve, complete: () => resolve(undefined) });
  });

describe('AdminAuditInterceptor (issue #1533)', () => {
  it('records actor, route, target and a masked body for an admin route', async () => {
    const { interceptor, context, audit } = build();

    await run(interceptor, context, { handle: () => of({ ok: true }) });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: AuditAction.ADMIN_HTTP_REQUEST,
        entityId: 'u1',
        after: expect.objectContaining({
          method: 'PATCH',
          route: '/api/v1/admin/users/:id/status',
          outcome: 'success',
          body: { isActive: false, password: '[REDACTED]', email: '[REDACTED]' },
        }),
      }),
    );
  });

  it('records failures with the status', async () => {
    const { interceptor, context, audit } = build();

    await run(interceptor, context, { handle: () => throwError(() => ({ status: 403 })) });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ outcome: 'failure', status: 403 }) }),
    );
  });

  it('ignores handlers marked @SkipAudit()', async () => {
    const { interceptor, context, audit } = build({ skip: true });
    await run(interceptor, context, { handle: () => of(1) });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('ignores non-admin routes and non-http contexts', async () => {
    const plain = build({ url: '/api/v1/wallets/me' });
    await run(plain.interceptor, plain.context, { handle: () => of(1) });
    expect(plain.audit.log).not.toHaveBeenCalled();

    const ws = build({ type: 'ws' });
    await run(ws.interceptor, ws.context, { handle: () => of(1) });
    expect(ws.audit.log).not.toHaveBeenCalled();
  });

  it('never fails the request when the audit write fails', async () => {
    const { interceptor, context } = build({ auditFails: true });
    await expect(run(interceptor, context, { handle: () => of('result') })).resolves.toBe('result');
  });
});
