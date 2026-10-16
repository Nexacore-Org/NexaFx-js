import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenType } from './token-types';

function contextWith(token?: string): ExecutionContext {
  const request = { headers: token ? { authorization: `Bearer ${token}` } : {} } as any;
  return {
    getType: () => 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard account status', () => {
  const build = (allowed: boolean) => {
    const jwt = { verify: jest.fn().mockReturnValue({ sub: 'u1', typ: TokenType.ACCESS, email: 'a@b.c', role: 'user' }) };
    const config = { get: jest.fn().mockReturnValue('secret') };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
    const status = { isAllowedToAuthenticate: jest.fn().mockResolvedValue(allowed) };
    const guard = new JwtAuthGuard(jwt as any, config as any, reflector, status as any);
    return { guard, status };
  };

  it('accepts a valid token for an active account', async () => {
    const { guard, status } = build(true);
    await expect(guard.canActivate(contextWith('t'))).resolves.toBe(true);
    expect(status.isAllowedToAuthenticate).toHaveBeenCalledWith('u1');
  });

  it('rejects a valid token once the account is suspended or deactivated', async () => {
    const { guard } = build(false);
    await expect(guard.canActivate(contextWith('t'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a missing token', async () => {
    const { guard } = build(true);
    await expect(guard.canActivate(contextWith())).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
