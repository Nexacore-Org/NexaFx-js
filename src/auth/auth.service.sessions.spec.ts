import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Issue #1515: login/register create a DB session and never block on terms. */
function build(termsAccepted = true) {
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'user',
    isActive: true,
    tokenVersion: 3,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordHash: '$2a$12$hash',
  };
  const usersService = {
    findByEmail: jest.fn().mockResolvedValue(user),
    findById: jest.fn().mockResolvedValue(user),
    resetLoginFailures: jest.fn(),
    createWithin: jest.fn(),
  };
  const termsService = {
    accept: jest.fn(),
    hasAcceptedCurrent: jest.fn().mockResolvedValue(termsAccepted),
    ensureAccepted: jest.fn().mockRejectedValue(new Error('login must not enforce terms')),
  };
  const jwtService = { sign: jest.fn((payload) => `jwt:${JSON.stringify(payload)}`) };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const deactivationService = { isUserDeactivated: jest.fn().mockResolvedValue(false) };
  const passwordService = { hash: jest.fn().mockResolvedValue('$2a$12$hash'), verify: jest.fn().mockResolvedValue(true) };
  const refreshTokens = {
    createToken: jest.fn().mockResolvedValue({ id: 'sess-1', token: 'rt-1', expiresAt: new Date('2030-01-01') }),
    rotateToken: jest.fn().mockResolvedValue({ id: 'sess-2', userId: 'user-1', token: 'rt-2', expiresAt: new Date('2030-01-02') }),
    revokeUserTokens: jest.fn(),
  };

  const service = new AuthService(
    usersService as any,
    termsService as any,
    jwtService as any,
    auditService as any,
    deactivationService as any,
    { sendAccountLockedEmail: jest.fn() } as any,
    { emit: jest.fn() } as any,
    { get: jest.fn() } as any,
    passwordService as any,
    { validate: jest.fn() } as any,
    refreshTokens as any,
  );
  return { service, user, usersService, termsService, jwtService, auditService, refreshTokens, deactivationService };
}

const payloadOf = (token: string) => JSON.parse(token.replace(/^jwt:/, ''));

describe('AuthService sessions (issue #1515)', () => {
  it('login creates a session and returns a refresh token', async () => {
    const { service, refreshTokens } = build();

    const result = await service.login({ email: 'user@example.com', password: 'pw' } as any, { ip: '1.2.3.4', userAgent: 'jest' });

    expect(refreshTokens.createToken).toHaveBeenCalledWith('user-1', expect.any(Object));
    expect(result.refreshToken).toBe('rt-1');
    expect(result.refreshTokenExpiresAt).toEqual(new Date('2030-01-01'));
    expect(result.requiresAction).toBeNull();
  });

  it('puts the session id and token version in the access token', async () => {
    const { service } = build();

    const result = await service.login({ email: 'user@example.com', password: 'pw' } as any);

    expect(payloadOf(result.accessToken)).toMatchObject({ sub: 'user-1', sid: 'sess-1', tv: 3 });
  });

  it('does not block login after a terms version bump; it flags requiresAction', async () => {
    const { service, termsService } = build(false);

    const result = await service.login({ email: 'user@example.com', password: 'pw' } as any);

    expect(termsService.ensureAccepted).not.toHaveBeenCalled();
    expect(result.requiresAction).toBe('accept_terms');
    expect(result.refreshToken).toBeDefined();
  });

  it('register issues a session and passes the transaction manager to terms and audit', async () => {
    const { service, user, usersService, termsService, auditService } = build();
    const manager = { tx: true };
    usersService.createWithin.mockImplementation(async (_data: unknown, work: (u: unknown, m: unknown) => Promise<void>) => {
      await work(user, manager);
      return { user };
    });

    const result = await service.register(
      { email: 'user@example.com', password: 'Str0ng!Passw0rd', firstName: 'A', lastName: 'B' } as any,
      { ip: '1.2.3.4' },
    );

    expect(termsService.accept).toHaveBeenCalledWith(expect.any(Object), manager);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.register' }), manager);
    expect(result.refreshToken).toBe('rt-1');
    expect(result.requiresAction).toBeNull();
  });

  it('a failing audit insert aborts registration (so the transaction rolls back)', async () => {
    const { service, user, usersService, auditService } = build();
    auditService.log.mockRejectedValue(new Error('audit insert failed'));
    usersService.createWithin.mockImplementation(async (_d: unknown, work: (u: unknown, m: unknown) => Promise<void>) => {
      await work(user, {});
      return { user };
    });

    await expect(
      service.register({ email: 'a@b.com', password: 'Str0ng!Passw0rd', firstName: 'A', lastName: 'B' } as any),
    ).rejects.toThrow('audit insert failed');
  });

  it('rotateRefreshToken issues a new pair for an active user', async () => {
    const { service } = build();

    const result = await service.rotateRefreshToken('rt-1');

    expect(result.refreshToken).toBe('rt-2');
    expect(payloadOf(result.accessToken)).toMatchObject({ sid: 'sess-2' });
  });

  it('rotateRefreshToken refuses and revokes sessions for a suspended user', async () => {
    const { service, user, refreshTokens } = build();
    user.isActive = false;

    await expect(service.rotateRefreshToken('rt-1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshTokens.revokeUserTokens).toHaveBeenCalledWith('user-1');
  });
});
