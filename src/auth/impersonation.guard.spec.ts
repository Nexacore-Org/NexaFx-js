import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { getRequestActorId, requestActorStorage } from '../common/context/request-actor.storage';
import { ImpersonationGuard } from './impersonation.guard';

const ctx = (method: string, user: unknown, type = 'http') =>
  ({ getType: () => type, switchToHttp: () => ({ getRequest: () => ({ method, user }) }) }) as unknown as ExecutionContext;

const impersonating = { id: 'u1', impersonation: true, actorId: 'admin-1' };

describe('ImpersonationGuard (issue #1537)', () => {
  const guard = new ImpersonationGuard();

  it.each(['GET', 'HEAD', 'OPTIONS', 'get'])('allows %s', (method) => {
    expect(guard.canActivate(ctx(method, impersonating))).toBe(true);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('refuses %s with 403', (method) => {
    expect(() => guard.canActivate(ctx(method, impersonating))).toThrow(ForbiddenException);
  });

  it('records the real actor for the duration of the request', () => {
    requestActorStorage.run(undefined as never, () => {
      guard.canActivate(ctx('GET', impersonating));
      expect(getRequestActorId()).toBe('admin-1');
    });
  });

  it('does not leak the actor into a later request handled in its own context', () => {
    requestActorStorage.run(undefined as never, () => {
      guard.canActivate(ctx('GET', impersonating));
    });

    // A second, ordinary request in a fresh context sees no actor.
    requestActorStorage.run(undefined as never, () => {
      guard.canActivate(ctx('GET', { id: 'u2' }));
      expect(getRequestActorId()).toBeUndefined();
    });
    expect(getRequestActorId()).toBeUndefined();
  });

  it('ignores normal sessions and non-http contexts', () => {
    expect(guard.canActivate(ctx('POST', { id: 'u1' }))).toBe(true);
    expect(guard.canActivate(ctx('POST', impersonating, 'ws'))).toBe(true);
  });
});
