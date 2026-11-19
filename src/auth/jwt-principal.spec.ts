import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountStatusService } from './account-status.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtAuthGuard as PassportJwtAuthGuard } from './guards/jwt-auth.guard';
import { buildPrincipal } from './jwt-payload';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenType } from './token-types';

/** Issue #1536: one token, one principal, whichever guard authenticates it. */
const SECRET = 'principal-secret-principal-secret-12345';
const jwt = new JwtService({});

function world(over: { passwordChangedAt?: Date | null } = {}) {
  const user = { id: 'u1', isActive: true, passwordChangedAt: over.passwordChangedAt ?? null };
  const usersService = { findByIdOrNull: jest.fn().mockResolvedValue(user) };
  const accountStatus = new AccountStatusService(usersService as any);
  const config = { get: jest.fn((k: string) => (k === 'jwt.secret' ? SECRET : undefined)) };

  const globalGuard = new JwtAuthGuard(jwt, config as any, { getAllAndOverride: () => false } as any, accountStatus);
  const strategy = new JwtStrategy(config as any, usersService as any, accountStatus);
  return { globalGuard, strategy, usersService };
}

async function viaGlobalGuard(guard: JwtAuthGuard, token: string) {
  const request: any = { headers: { authorization: `Bearer ${token}` } };
  const context = { getType: () => 'http', getHandler: () => 'h', getClass: () => 'c', switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  await guard.canActivate(context);
  return request.user;
}

async function viaStrategy(strategy: JwtStrategy, token: string) {
  return strategy.validate(jwt.verify(token, { secret: SECRET }));
}

describe('JWT principal (issue #1536)', () => {
  it('builds the same principal on a global-guard route and a passport route', async () => {
    const { globalGuard, strategy } = world();
    const token = jwt.sign(
      { typ: TokenType.ACCESS, sub: 'u1', email: 'a@b.c', role: 'admin', isEmailVerified: true, tv: 3, sid: 'sess-1' },
      { secret: SECRET, expiresIn: 600 },
    );

    const fromGlobal = await viaGlobalGuard(globalGuard, token);
    const fromPassport = await viaStrategy(strategy, token);

    expect(fromGlobal).toEqual(fromPassport);
    expect(fromGlobal).toMatchObject({ id: 'u1', sub: 'u1', role: 'admin', sid: 'sess-1', tokenVersion: 3 });
  });

  it('keeps impersonation and the actor on both paths', async () => {
    const { globalGuard, strategy } = world();
    const token = jwt.sign(
      { typ: TokenType.ACCESS, sub: 'u1', role: 'user', tv: 0, impersonation: true, act: { sub: 'admin-9' } },
      { secret: SECRET, expiresIn: 600 },
    );

    const fromGlobal = await viaGlobalGuard(globalGuard, token);
    const fromPassport = await viaStrategy(strategy, token);

    expect(fromGlobal).toMatchObject({ impersonation: true, actorId: 'admin-9' });
    expect(fromPassport).toEqual(fromGlobal);
  });

  it('refuses a token issued before a password reset on BOTH paths', async () => {
    const { globalGuard, strategy } = world({ passwordChangedAt: new Date(Date.now() + 5_000) });
    const token = jwt.sign({ typ: TokenType.ACCESS, sub: 'u1', tv: 0 }, { secret: SECRET, expiresIn: 600 });

    await expect(viaGlobalGuard(globalGuard, token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(viaStrategy(strategy, token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a suspended user on both paths', async () => {
    const { globalGuard, strategy, usersService } = world();
    usersService.findByIdOrNull.mockResolvedValue({ id: 'u1', isActive: false });
    const token = jwt.sign({ typ: TokenType.ACCESS, sub: 'u1', tv: 0 }, { secret: SECRET, expiresIn: 600 });

    await expect(viaGlobalGuard(globalGuard, token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(viaStrategy(strategy, token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('buildPrincipal defaults tokenVersion to 0 and omits sid/impersonation when absent', () => {
    expect(buildPrincipal({ sub: 'u1', email: 'a@b.c', role: 'user' })).toEqual({
      id: 'u1',
      sub: 'u1',
      email: 'a@b.c',
      role: 'user',
      isEmailVerified: undefined,
      authMethod: 'jwt',
      tokenVersion: 0,
    });
  });

  it('the route-level passport guard does not re-authenticate an already authenticated request', () => {
    const guard = new PassportJwtAuthGuard({ getAllAndOverride: () => false } as any);
    const context = {
      getHandler: () => 'h',
      getClass: () => 'c',
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1' } }) }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
