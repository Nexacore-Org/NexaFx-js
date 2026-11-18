import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TokenVersionGuard } from './token-version.guard';

const ctx = (user: unknown, type = 'http') =>
  ({ getType: () => type, switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

describe('TokenVersionGuard (issue #1537)', () => {
  const versions = (current: number | null) => ({ currentVersion: jest.fn().mockResolvedValue(current) });

  it('accepts a token at the current version', async () => {
    const guard = new TokenVersionGuard(versions(3) as any);
    await expect(guard.canActivate(ctx({ id: 'u1', tokenVersion: 3 }))).resolves.toBe(true);
  });

  it('refuses a stale token (issued before a role or status change)', async () => {
    const guard = new TokenVersionGuard(versions(4) as any);
    await expect(guard.canActivate(ctx({ id: 'u1', tokenVersion: 3 }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('treats a missing tokenVersion as 0', async () => {
    await expect(new TokenVersionGuard(versions(0) as any).canActivate(ctx({ id: 'u1' }))).resolves.toBe(true);
    await expect(new TokenVersionGuard(versions(1) as any).canActivate(ctx({ id: 'u1' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a token for a user that no longer exists', async () => {
    const guard = new TokenVersionGuard(versions(null) as any);
    await expect(guard.canActivate(ctx({ id: 'ghost', tokenVersion: 0 }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('skips API-key principals, anonymous requests and non-http contexts', async () => {
    const service = versions(9);
    const guard = new TokenVersionGuard(service as any);

    await expect(guard.canActivate(ctx({ id: 'u1', authMethod: 'api_key' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(undefined))).resolves.toBe(true);
    await expect(guard.canActivate(ctx({ id: 'u1', tokenVersion: 0 }, 'ws'))).resolves.toBe(true);
    expect(service.currentVersion).not.toHaveBeenCalled();
  });

  it('is a no-op when the service is not wired', async () => {
    await expect(new TokenVersionGuard().canActivate(ctx({ id: 'u1', tokenVersion: 0 }))).resolves.toBe(true);
  });
});
