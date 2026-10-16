import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const BCRYPT_HASH = '$2a$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz0123';

function build() {
  const usersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findByIdOrNull: jest.fn(),
    update: jest.fn(),
    recordFailedLogin: jest.fn(),
    resetLoginFailures: jest.fn(),
  };
  const termsService = { accept: jest.fn(), ensureAccepted: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('signed'), verify: jest.fn() };
  const auditService = { log: jest.fn() };
  const deactivationService = { isUserDeactivated: jest.fn().mockResolvedValue(false) };
  const mailService = { sendAccountLockedEmail: jest.fn() };
  const events = { emit: jest.fn() };
  const configService = { get: jest.fn().mockReturnValue('refresh-secret-value') };
  const passwordService = {
    hash: jest.fn().mockResolvedValue(BCRYPT_HASH),
    verify: jest.fn(),
  };
  const passwordPolicyService = { validate: jest.fn() };

  const service = new AuthService(
    usersService as any,
    termsService as any,
    jwtService as any,
    auditService as any,
    deactivationService as any,
    mailService as any,
    events as any,
    configService as any,
    passwordService as any,
    passwordPolicyService as any,
  );
  return {
    service,
    usersService,
    termsService,
    jwtService,
    auditService,
    deactivationService,
    mailService,
    events,
    passwordService,
  };
}

const baseUser = (over: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'user@example.com',
  role: 'user',
  isActive: true,
  require2fa: false,
  failedLoginAttempts: 0,
  lockedUntil: null,
  passwordHash: BCRYPT_HASH,
  ...over,
});

describe('AuthService', () => {
  describe('register', () => {
    it('registers a user, accepts terms and logs an audit event', async () => {
      const { service, usersService, termsService, auditService } = build();
      usersService.create.mockResolvedValue({ id: 'u2', email: 'a@b.c', role: 'user' });

      await expect(
        service.register({ email: 'a@b.c', password: 'secret', firstName: 'A', lastName: 'B' }),
      ).resolves.toEqual({ accessToken: 'signed' });
      expect(termsService.accept).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2' }));
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.register', userId: 'u2' }),
      );
    });

    it('propagates creation errors without issuing a token', async () => {
      const { service, usersService, jwtService } = build();
      usersService.create.mockRejectedValue(new Error('db constraint'));
      await expect(
        service.register({ email: 'a@b.c', password: 'secret', firstName: 'A', lastName: 'B' }),
      ).rejects.toThrow('db constraint');
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('login — credential handling', () => {
    it('still verifies a dummy hash for unknown emails (uniform timing)', async () => {
      const { service, usersService, passwordService } = build();
      usersService.findByEmail.mockResolvedValue(null);
      passwordService.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: 'ghost@example.com', password: 'whatever1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(passwordService.verify).toHaveBeenCalledTimes(1);
    });

    it('rejects a wrong password with a generic 401', async () => {
      const { service, usersService, passwordService } = build();
      usersService.findByEmail.mockResolvedValue(baseUser());
      passwordService.verify.mockResolvedValue(false);
      usersService.recordFailedLogin.mockResolvedValue({ failedLoginAttempts: 1, lockedUntil: null });

      await expect(
        service.login({ email: 'user@example.com', password: 'wrong-password' }),
      ).rejects.toThrow('Invalid credentials');
    });

    it('migrates a legacy SHA-256 hash to bcrypt on successful login', async () => {
      const { service, usersService, passwordService, termsService } = build();
      usersService.findByEmail.mockResolvedValue(baseUser({ passwordHash: sha256('secret123') }));
      termsService.ensureAccepted.mockResolvedValue(undefined);

      await expect(
        service.login({ email: 'user@example.com', password: 'secret123' }),
      ).resolves.toEqual({ accessToken: 'signed' });
      expect(passwordService.hash).toHaveBeenCalledWith('secret123');
      expect(usersService.update).toHaveBeenCalledWith('user-1', { passwordHash: BCRYPT_HASH });
    });

    it('rejects a wrong password against a legacy hash', async () => {
      const { service, usersService } = build();
      usersService.findByEmail.mockResolvedValue(baseUser({ passwordHash: sha256('right-one') }));
      usersService.recordFailedLogin.mockResolvedValue({ failedLoginAttempts: 1, lockedUntil: null });

      await expect(
        service.login({ email: 'user@example.com', password: 'wrong-one' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('login — lockout (atomic counter)', () => {
    it('records every failure through the atomic repository helper', async () => {
      const { service, usersService, passwordService } = build();
      usersService.findByEmail.mockResolvedValue(baseUser());
      passwordService.verify.mockResolvedValue(false);
      usersService.recordFailedLogin.mockResolvedValue({ failedLoginAttempts: 2, lockedUntil: null });

      await expect(service.login({ email: 'user@example.com', password: 'nope-nope' })).rejects.toThrow();
      expect(usersService.recordFailedLogin).toHaveBeenCalledWith('user-1', 5, 30);
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it('sends the user lockout email and an admin event on the fifth failure', async () => {
      const { service, usersService, passwordService, mailService, events } = build();
      usersService.findByEmail.mockResolvedValue(baseUser({ failedLoginAttempts: 4 }));
      passwordService.verify.mockResolvedValue(false);
      usersService.recordFailedLogin.mockResolvedValue({
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 60_000),
      });

      await expect(service.login({ email: 'user@example.com', password: 'nope-nope' })).rejects.toThrow();
      expect(mailService.sendAccountLockedEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'user@example.com', lockoutMinutes: 30 }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'admin.alert.account-lockout',
        expect.objectContaining({ type: 'account-lockout' }),
      );
    });

    it('five concurrent bad attempts all hit the atomic counter, and the 5th locks', async () => {
      const { service, usersService, passwordService, mailService } = build();
      usersService.findByEmail.mockResolvedValue(baseUser());
      passwordService.verify.mockResolvedValue(false);
      let count = 0;
      usersService.recordFailedLogin.mockImplementation(async () => {
        count += 1; // the database increments atomically
        return {
          failedLoginAttempts: count,
          lockedUntil: count >= 5 ? new Date(Date.now() + 60_000) : null,
        };
      });

      await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          service.login({ email: 'user@example.com', password: 'guess-guess' }),
        ),
      );
      expect(usersService.recordFailedLogin).toHaveBeenCalledTimes(5);
      expect(mailService.sendAccountLockedEmail).toHaveBeenCalledTimes(1);
    });

    it('does not count attempts or reveal lock state for a locked account with a wrong password', async () => {
      const { service, usersService, passwordService } = build();
      usersService.findByEmail.mockResolvedValue(
        baseUser({ lockedUntil: new Date(Date.now() + 60_000), failedLoginAttempts: 5 }),
      );
      passwordService.verify.mockResolvedValue(false);

      const error = await service
        .login({ email: 'user@example.com', password: 'nope-nope' })
        .catch((e) => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toBe('Invalid credentials');
      expect(usersService.recordFailedLogin).not.toHaveBeenCalled();
    });

    it('tells a user with the right password that the account is locked, without the unlock time', async () => {
      const { service, usersService, passwordService } = build();
      const lockedUntil = new Date(Date.now() + 60_000);
      usersService.findByEmail.mockResolvedValue(baseUser({ lockedUntil, failedLoginAttempts: 5 }));
      passwordService.verify.mockResolvedValue(true);

      const error = await service
        .login({ email: 'user@example.com', password: 'correct-pass' })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(JSON.stringify(error.getResponse())).not.toContain(lockedUntil.toISOString());
    });

    it('resets failures with a column-only update after a successful login', async () => {
      const { service, usersService, passwordService, termsService } = build();
      usersService.findByEmail.mockResolvedValue(baseUser({ failedLoginAttempts: 3 }));
      passwordService.verify.mockResolvedValue(true);
      termsService.ensureAccepted.mockResolvedValue(undefined);

      await service.login({ email: 'user@example.com', password: 'correct-pass' });
      expect(usersService.resetLoginFailures).toHaveBeenCalledWith('user-1');
    });
  });

  describe('login — 2FA and disabled accounts', () => {
    it('does not reveal an admin account before the password is verified', async () => {
      const { service, usersService, passwordService } = build();
      usersService.findByEmail.mockResolvedValue(baseUser({ role: 'admin', require2fa: true }));
      passwordService.verify.mockResolvedValue(false);
      usersService.recordFailedLogin.mockResolvedValue({ failedLoginAttempts: 1, lockedUntil: null });

      await expect(
        service.login({ email: 'user@example.com', password: 'wrong-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('asks an admin with the right password for the 2FA code', async () => {
      const { service, usersService, passwordService } = build();
      usersService.findByEmail.mockResolvedValue(baseUser({ role: 'admin', require2fa: true }));
      passwordService.verify.mockResolvedValue(true);

      await expect(
        service.login({ email: 'user@example.com', password: 'correct-pass' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a suspended user (isActive=false) like a deactivated one', async () => {
      const { service, usersService, passwordService } = build();
      usersService.findByEmail.mockResolvedValue(baseUser({ isActive: false }));
      passwordService.verify.mockResolvedValue(true);

      await expect(
        service.login({ email: 'user@example.com', password: 'correct-pass' }),
      ).rejects.toThrow('Account has been deactivated by an administrator');
    });

    it('rejects a deactivated user', async () => {
      const { service, usersService, passwordService, deactivationService } = build();
      usersService.findByEmail.mockResolvedValue(baseUser());
      passwordService.verify.mockResolvedValue(true);
      deactivationService.isUserDeactivated.mockResolvedValue(true);

      await expect(
        service.login({ email: 'user@example.com', password: 'correct-pass' }),
      ).rejects.toThrow('Account has been deactivated by an administrator');
    });

    it('requires terms acceptance and issues a token on success', async () => {
      const { service, usersService, passwordService, termsService, auditService } = build();
      usersService.findByEmail.mockResolvedValue(baseUser());
      passwordService.verify.mockResolvedValue(true);
      termsService.ensureAccepted.mockResolvedValue(undefined);

      await expect(
        service.login({ email: 'user@example.com', password: 'correct-pass' }),
      ).resolves.toEqual({ accessToken: 'signed' });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.login', userId: 'user-1' }),
      );
    });
  });

  describe('rotateRefreshToken', () => {
    const payload = { sub: 'user-1', typ: 'refresh' };

    it('refuses to renew for a suspended user', async () => {
      const { service, usersService, jwtService } = build();
      jwtService.verify.mockReturnValue(payload);
      usersService.findByIdOrNull.mockResolvedValue(baseUser({ isActive: false }));
      await expect(service.rotateRefreshToken('r1')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refuses to renew for a deactivated user', async () => {
      const { service, usersService, jwtService, deactivationService } = build();
      jwtService.verify.mockReturnValue(payload);
      usersService.findByIdOrNull.mockResolvedValue(baseUser());
      deactivationService.isUserDeactivated.mockResolvedValue(true);
      await expect(service.rotateRefreshToken('r2')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refuses to renew for a deleted user', async () => {
      const { service, usersService, jwtService } = build();
      jwtService.verify.mockReturnValue(payload);
      usersService.findByIdOrNull.mockResolvedValue(null);
      await expect(service.rotateRefreshToken('r3')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('renews for an active user', async () => {
      const { service, usersService, jwtService } = build();
      jwtService.verify.mockReturnValue(payload);
      usersService.findByIdOrNull.mockResolvedValue(baseUser());
      await expect(service.rotateRefreshToken('r4')).resolves.toEqual(
        expect.objectContaining({ accessToken: 'signed' }),
      );
    });
  });
});
