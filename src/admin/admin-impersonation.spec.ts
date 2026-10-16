import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ImpersonationGuard } from '../auth/impersonation.guard';
import { getRequestActorId, requestActorStorage } from '../common/context/request-actor.storage';
import { AuditService } from '../audit/audit.service';

function build(target: Record<string, unknown> | null, withJwt = true) {
  const users = { findOne: jest.fn().mockResolvedValue(target) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const jwt = { sign: jest.fn().mockReturnValue('signed.jwt') };
  const service = new AdminService(
    users as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    audit as any,
    (withJwt ? jwt : undefined) as any,
  );
  return { service, users, audit, jwt };
}

describe('AdminService.impersonateUser (#1356)', () => {
  const user = { id: 'u1', email: 'u@x.com', role: 'user', isEmailVerified: true };

  it('issues a real, short-lived access token carrying the actor claim', async () => {
    const { service, jwt, audit } = build(user);
    const res = await service.impersonateUser('u1', 'admin-1', 'Reproducing a reported bug');

    expect(res.token).toBe('signed.jwt');
    expect(res.readOnly).toBe(true);
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'u1',
        typ: 'access',
        impersonation: true,
        act: { sub: 'admin-1' },
      }),
      { expiresIn: '15m' },
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin-1', reason: 'Reproducing a reported bug' }),
    );
  });

  it.each(['admin', 'compliance'])('refuses to impersonate a %s account', async (role) => {
    const { service, jwt } = build({ ...user, role });
    await expect(service.impersonateUser('u1', 'admin-1', 'A long enough reason')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('requires an authenticated admin', async () => {
    const { service } = build(user);
    await expect(
      service.impersonateUser('u1', undefined as unknown as string, 'A long enough reason'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ImpersonationGuard', () => {
  const guard = new ImpersonationGuard();
  const ctx = (method: string, user: Record<string, unknown>) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ method, user }) }),
    }) as unknown as ExecutionContext;

  it('lets normal sessions through for any method', () => {
    expect(guard.canActivate(ctx('POST', { id: 'u1' }))).toBe(true);
  });

  it('allows reads in an impersonated session', () => {
    expect(guard.canActivate(ctx('GET', { id: 'u1', impersonation: true, actorId: 'admin-1' }))).toBe(true);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('blocks %s in an impersonated session', (method) => {
    expect(() => guard.canActivate(ctx(method, { id: 'u1', impersonation: true, actorId: 'admin-1' }))).toThrow(
      ForbiddenException,
    );
  });

  it('records the actor for audit entries written during an impersonated request', async () => {
    await requestActorStorage.run({ actorId: 'admin-1' }, async () => {
      const repo = { create: jest.fn((v) => v), save: jest.fn(async (v) => v) };
      const audit = new AuditService(repo as any);
      await audit.log({ action: 'wallet.view', entityType: 'wallet', userId: 'u1' });
      expect(getRequestActorId()).toBe('admin-1');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ after: expect.objectContaining({ impersonatedBy: 'admin-1' }) }),
      );
    });
  });
});
