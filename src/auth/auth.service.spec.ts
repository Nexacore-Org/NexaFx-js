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

  it('registers a user and issues a token', async () => {
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
});
