import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TokenVersionGuard } from './token-version.guard';

const httpContext = (user?: unknown) =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('TokenVersionGuard', () => {
  const guardFor = (current: number | null) =>
    new TokenVersionGuard({ currentVersion: jest.fn().mockResolvedValue(current) } as any);

  it('accepts a token with the current version', async () => {
    await expect(
      guardFor(2).canActivate(httpContext({ id: 'u1', tokenVersion: 2 })),
    ).resolves.toBe(true);
  });

  it('rejects a token issued before a role or status change', async () => {
    await expect(
      guardFor(3).canActivate(httpContext({ id: 'u1', tokenVersion: 2 })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token for a user that no longer exists', async () => {
    await expect(
      guardFor(null).canActivate(httpContext({ id: 'u1', tokenVersion: 0 })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('skips unauthenticated, API-key and non-HTTP contexts', async () => {
    await expect(guardFor(5).canActivate(httpContext(undefined))).resolves.toBe(true);
    await expect(
      guardFor(5).canActivate(httpContext({ id: 'u1', authMethod: 'api_key' })),
    ).resolves.toBe(true);
    await expect(
      guardFor(5).canActivate({ getType: () => 'graphql' } as unknown as ExecutionContext),
    ).resolves.toBe(true);
  });
});
