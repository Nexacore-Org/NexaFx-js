import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { TermsAcceptanceService } from '../terms/terms-acceptance.service';
import { AuditService } from '../audit/audit.service';

describe('AuthService', () => {
  const usersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
  } as unknown as UsersService;
  const termsService = {
    accept: jest.fn(),
    ensureAccepted: jest.fn(),
  } as unknown as TermsAcceptanceService;
  const jwtService = {
    sign: jest.fn(),
  } as unknown as JwtService;
  const auditService = {
    log: jest.fn(),
  } as unknown as AuditService;
  const service = new AuthService(
    usersService,
    termsService,
    jwtService,
    auditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── register ──────────────────────────────────────────────────────────────

  it('registers a user and issues an access token', async () => {
    (usersService.create as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
    });
    (jwtService.sign as jest.Mock).mockReturnValue('token-1');

    await expect(
      service.register({
        email: 'user@example.com',
        password: 'secret',
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    ).resolves.toEqual({ accessToken: 'token-1' });
  });

  it('accepts terms and logs audit event on registration', async () => {
    (usersService.create as jest.Mock).mockResolvedValue({
      id: 'user-2',
      email: 'user2@example.com',
      role: 'user',
    });
    (jwtService.sign as jest.Mock).mockReturnValue('token-2');

    await service.register({
      email: 'user2@example.com',
      password: 'pass',
      firstName: 'Bob',
      lastName: 'Smith',
    });

    expect(termsService.accept).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2' }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.register', userId: 'user-2' }),
    );
  });

  it('propagates error when user creation fails during registration', async () => {
    (usersService.create as jest.Mock).mockRejectedValue(
      new Error('db constraint'),
    );

    await expect(
      service.register({
        email: 'dup@example.com',
        password: 'secret',
        firstName: 'X',
        lastName: 'Y',
      }),
    ).rejects.toThrow('db constraint');

    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  // ── login ─────────────────────────────────────────────────────────────────

  it('requires terms acceptance before login', async () => {
    (usersService.findByEmail as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash:
        '2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b',
      role: 'user',
    });
    (termsService.ensureAccepted as jest.Mock).mockRejectedValue(
      new Error('accept terms'),
    );

    await expect(
      service.login({ email: 'user@example.com', password: 'secret' }),
    ).rejects.toThrow('accept terms');
  });

  it('throws UnauthorizedException for unknown email', async () => {
    (usersService.findByEmail as jest.Mock).mockResolvedValue(null);

    await expect(
      service.login({ email: 'ghost@example.com', password: 'secret' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException for wrong password', async () => {
    (usersService.findByEmail as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      // SHA-256 of "correct-password"
      passwordHash:
        'b109f3bbbc244eb82441917ed06d618b9008dd09b3befd1b5e07394c706a8bb9',
      role: 'user',
    });

    await expect(
      service.login({ email: 'user@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('issues a token and logs audit event on successful login', async () => {
    (usersService.findByEmail as jest.Mock).mockResolvedValue({
      id: 'user-3',
      email: 'user3@example.com',
      passwordHash:
        '2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b',
      role: 'user',
    });
    (termsService.ensureAccepted as jest.Mock).mockResolvedValue(undefined);
    (jwtService.sign as jest.Mock).mockReturnValue('token-3');

    const result = await service.login({
      email: 'user3@example.com',
      password: 'secret',
    });

    expect(result).toEqual({ accessToken: 'token-3' });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login', userId: 'user-3' }),
    );
  });
});
