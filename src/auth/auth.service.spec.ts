import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { TermsAcceptanceService } from '../terms/terms-acceptance.service';
import { AuditService } from '../audit/audit.service';
import { UserDeactivationService } from '../modules/user-deactivation/services/user-deactivation.service';
import { MailService } from '../mail/mail.service';
import { PasswordService } from './password.service';
import { PasswordPolicyService } from './password-policy.service';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const BCRYPT_HASH = '$2a$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz0123';
const STRONG_PASSWORD = 'Correct-Horse-Battery-42!';

/** Builds AuthService through Nest DI so constructor order can never drift out of sync with this spec. */
async function build() {
  const mocks = {
    users: { create: jest.fn(), findByEmail: jest.fn(), update: jest.fn(), findById: jest.fn() },
    terms: { accept: jest.fn(), ensureAccepted: jest.fn() },
    jwt: { sign: jest.fn().mockReturnValue('signed-token'), verify: jest.fn() },
    audit: { log: jest.fn() },
    deactivation: { isUserDeactivated: jest.fn().mockResolvedValue(false) },
    mail: { sendAdminAlert: jest.fn().mockResolvedValue(undefined) },
    events: { emit: jest.fn() },
    config: { get: jest.fn() },
    passwords: { hash: jest.fn().mockResolvedValue(BCRYPT_HASH), verify: jest.fn() },
    policy: { validate: jest.fn() },
  };
  const module = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: UsersService, useValue: mocks.users },
      { provide: TermsAcceptanceService, useValue: mocks.terms },
      { provide: JwtService, useValue: mocks.jwt },
      { provide: AuditService, useValue: mocks.audit },
      { provide: UserDeactivationService, useValue: mocks.deactivation },
      { provide: MailService, useValue: mocks.mail },
      { provide: EventEmitter2, useValue: mocks.events },
      { provide: ConfigService, useValue: mocks.config },
      { provide: PasswordService, useValue: mocks.passwords },
      { provide: PasswordPolicyService, useValue: mocks.policy },
    ],
  }).compile();
  return { service: module.get(AuthService), mocks };
}

const baseUser = (over: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'user@example.com',
  role: 'user',
  require2fa: false,
  failedLoginAttempts: 0,
  lockedUntil: null as Date | null,
  passwordHash: BCRYPT_HASH,
  ...over,
});

describe('AuthService', () => {
  describe('register', () => {
    const dto = { email: 'new@example.com', password: STRONG_PASSWORD, firstName: 'Ada', lastName: 'Lovelace' };

    it('validates the policy, hashes the password, accepts terms and audits', async () => {
      const { service, mocks } = await build();
      mocks.users.create.mockResolvedValue({ id: 'u2', email: dto.email, role: 'user' });

      await expect(service.register(dto, { ip: '1.2.3.4', userAgent: 'jest' })).resolves.toEqual({
        accessToken: 'signed-token',
      });

      expect(mocks.policy.validate).toHaveBeenCalledWith(dto.password);
      expect(mocks.passwords.hash).toHaveBeenCalledWith(dto.password);
      expect(mocks.users.create).toHaveBeenCalledWith(expect.objectContaining({ passwordHash: BCRYPT_HASH }));
      expect(mocks.terms.accept).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2', ipAddress: '1.2.3.4' }));
      expect(mocks.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.register', userId: 'u2' }));
    });

    it('propagates a policy failure and creates nothing', async () => {
      const { service, mocks } = await build();
      mocks.policy.validate.mockImplementation(() => {
        throw new Error('too weak');
      });
      await expect(service.register({ ...dto, password: 'weak' })).rejects.toThrow('too weak');
      expect(mocks.users.create).not.toHaveBeenCalled();
    });

    it('propagates user-creation errors without issuing a token', async () => {
      const { service, mocks } = await build();
      mocks.users.create.mockRejectedValue(new Error('db constraint'));
      await expect(service.register(dto)).rejects.toThrow('db constraint');
      expect(mocks.jwt.sign).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const creds = { email: 'user@example.com', password: STRONG_PASSWORD };

    it('rejects an unknown email with 401', async () => {
      const { service, mocks } = await build();
      mocks.users.findByEmail.mockResolvedValue(null);
      await expect(service.login(creds)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('counts a wrong password', async () => {
      const { service, mocks } = await build();
      mocks.users.findByEmail.mockResolvedValue(baseUser({ failedLoginAttempts: 1 }));
      mocks.passwords.verify.mockResolvedValue(false);

      await expect(service.login(creds)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mocks.users.update).toHaveBeenCalledWith('user-1', { failedLoginAttempts: 2 });
    });

    it('locks the account on the 5th failure, mails the user and raises the admin alert', async () => {
      const { service, mocks } = await build();
      mocks.users.findByEmail.mockResolvedValue(baseUser({ failedLoginAttempts: 4 }));
      mocks.passwords.verify.mockResolvedValue(false);

      await expect(service.login(creds)).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mocks.users.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ failedLoginAttempts: 5, lockedUntil: expect.any(Date) }),
      );
      const lockedUntil = (mocks.users.update.mock.calls[0][1] as { lockedUntil: Date }).lockedUntil;
      expect(lockedUntil.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
      expect(mocks.mail.sendAdminAlert).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@example.com' }));
      expect(mocks.events.emit).toHaveBeenCalledWith(
        'admin.alert.account-lockout',
        expect.objectContaining({ type: 'account-lockout' }),
      );
    });

    it('rejects a locked account with 403', async () => {
      const { service, mocks } = await build();
      mocks.users.findByEmail.mockResolvedValue(baseUser({ lockedUntil: new Date(Date.now() + 60_000) }));
      await expect(service.login(creds)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mocks.passwords.verify).not.toHaveBeenCalled();
    });

    it('resets the counters after a successful login', async () => {
      const { service, mocks } = await build();
      mocks.users.findByEmail.mockResolvedValue(baseUser({ failedLoginAttempts: 3 }));
      mocks.passwords.verify.mockResolvedValue(true);
      mocks.terms.ensureAccepted.mockResolvedValue(undefined);

      await expect(service.login(creds)).resolves.toEqual({ accessToken: 'signed-token' });
      expect(mocks.users.update).toHaveBeenCalledWith('user-1', { failedLoginAttempts: 0, lockedUntil: null });
      expect(mocks.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login', userId: 'user-1' }));
    });

    it('requires terms acceptance', async () => {
      const { service, mocks } = await build();
      mocks.users.findByEmail.mockResolvedValue(baseUser());
      mocks.passwords.verify.mockResolvedValue(true);
      mocks.terms.ensureAccepted.mockRejectedValue(new Error('accept terms'));
      await expect(service.login(creds)).rejects.toThrow('accept terms');
    });
  });

  describe('login - legacy SHA-256 hashes', () => {
    it('migrates a correct legacy password to bcrypt via usersService.update', async () => {
      const { service, mocks } = await build();
      mocks.users.findByEmail.mockResolvedValue(baseUser({ passwordHash: sha256(STRONG_PASSWORD) }));
      mocks.terms.ensureAccepted.mockResolvedValue(undefined);

      await expect(service.login({ email: 'user@example.com', password: STRONG_PASSWORD })).resolves.toEqual({
        accessToken: 'signed-token',
      });
      expect(mocks.passwords.hash).toHaveBeenCalledWith(STRONG_PASSWORD);
      expect(mocks.users.update).toHaveBeenCalledWith('user-1', { passwordHash: BCRYPT_HASH });
      expect(mocks.passwords.verify).not.toHaveBeenCalled();
    });

    it('does not migrate when the legacy password is wrong', async () => {
      const { service, mocks } = await build();
      mocks.users.findByEmail.mockResolvedValue(baseUser({ passwordHash: sha256('another-password') }));

      await expect(service.login({ email: 'user@example.com', password: STRONG_PASSWORD })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(mocks.passwords.hash).not.toHaveBeenCalled();
      expect(mocks.users.update).not.toHaveBeenCalledWith('user-1', expect.objectContaining({ passwordHash: expect.anything() }));
    });
  });

  describe('login - account state', () => {
    it('rejects a deactivated user with 401', async () => {
      const { service, mocks } = await build();
      mocks.users.findByEmail.mockResolvedValue(baseUser());
      mocks.passwords.verify.mockResolvedValue(true);
      mocks.terms.ensureAccepted.mockResolvedValue(undefined);
      mocks.deactivation.isUserDeactivated.mockResolvedValue(true);

      await expect(service.login({ email: 'user@example.com', password: STRONG_PASSWORD })).rejects.toThrow(
        'Account has been deactivated by an administrator',
      );
    });

    it('requires a TOTP code for an admin with require2fa', async () => {
      const { service, mocks } = await build();
      mocks.users.findByEmail.mockResolvedValue(baseUser({ role: 'admin', require2fa: true }));
      await expect(service.login({ email: 'user@example.com', password: STRONG_PASSWORD })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mocks.passwords.verify).not.toHaveBeenCalled();
    });

    it('lets an admin with require2fa continue once a TOTP code is supplied', async () => {
      const { service, mocks } = await build();
      mocks.users.findByEmail.mockResolvedValue(baseUser({ role: 'admin', require2fa: true }));
      mocks.passwords.verify.mockResolvedValue(true);
      mocks.terms.ensureAccepted.mockResolvedValue(undefined);
      await expect(
        service.login({ email: 'user@example.com', password: STRONG_PASSWORD, totpCode: '123456' }),
      ).resolves.toEqual({ accessToken: 'signed-token' });
    });
  });
});
