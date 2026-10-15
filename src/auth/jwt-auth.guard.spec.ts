import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'guard-test-secret-at-least-32-characters';
const jwt = new JwtService({ secret: SECRET });
const config = { get: jest.fn(() => SECRET) } as unknown as ConfigService;
const reflector = { getAllAndOverride: jest.fn(() => false) } as unknown as Reflector;
const guard = new JwtAuthGuard(jwt, config, reflector);

const run = (token: string) => {
  const request: { headers: Record<string, string>; user?: any } = {
    headers: { authorization: `Bearer ${token}` },
  };
  const ctx = {
    getType: () => 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { request, result: () => guard.canActivate(ctx) };
};

describe('JwtAuthGuard', () => {
  it('sets request.user.id to the token subject for access tokens', () => {
    const { request, result } = run(
      jwt.sign({ sub: 'user-1', email: 'a@b.com', role: 'admin', typ: 'access' }),
    );
    expect(result()).toBe(true);
    expect(request.user).toMatchObject({
      id: 'user-1',
      sub: 'user-1',
      email: 'a@b.com',
      role: 'admin',
    });
  });

  it.each(['refresh', 'sep10', 'export-download'])(
    'rejects a token with typ=%s',
    (typ) => {
      const { result } = run(jwt.sign({ sub: 'user-1', typ }));
      expect(result).toThrow(UnauthorizedException);
    },
  );

  it('rejects a token without typ', () => {
    const { result } = run(jwt.sign({ sub: 'user-1' }));
    expect(result).toThrow(UnauthorizedException);
  });

  it('rejects an access token without sub', () => {
    const { result } = run(jwt.sign({ email: 'a@b.com', typ: 'access' }));
    expect(result).toThrow(UnauthorizedException);
  });
});
