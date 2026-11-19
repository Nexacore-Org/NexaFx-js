import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenType } from './token-types';

/** Issue #1529: logout / revoke-this-device take effect on the next request, not after the token expires. */
function build(payload: Record<string, unknown>, sessionActive: boolean) {
  const jwt = { verify: jest.fn().mockReturnValue({ sub: 'user-1', typ: TokenType.ACCESS, ...payload }) };
  const config = { get: jest.fn().mockReturnValue('secret') };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const refreshTokens = { isSessionActive: jest.fn().mockResolvedValue(sessionActive) };
  const request: any = { headers: { authorization: 'Bearer abc' } };
  const context = {
    getType: () => 'http',
    getHandler: () => 'h',
    getClass: () => 'c',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const guard = new JwtAuthGuard(jwt as any, config as any, reflector as any, undefined, refreshTokens as any);
  return { guard, context, request, refreshTokens };
}

describe('JwtAuthGuard revoked-session check (issue #1529)', () => {
  it('rejects a token whose session was revoked', async () => {
    const { guard, context } = build({ sid: 'sess-1' }, false);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a token with a live session and exposes sid on the principal', async () => {
    const { guard, context, request, refreshTokens } = build({ sid: 'sess-1' }, true);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(refreshTokens.isSessionActive).toHaveBeenCalledWith('user-1', 'sess-1');
    expect(request.user).toMatchObject({ id: 'user-1', sid: 'sess-1' });
  });

  it('does not check anything for tokens without a session id (e.g. impersonation tokens)', async () => {
    const { guard, context, refreshTokens } = build({}, false);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(refreshTokens.isSessionActive).not.toHaveBeenCalled();
  });
});
