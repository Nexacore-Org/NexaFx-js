import { AuthService } from './auth.service';

const BCRYPT = '$2a$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz0123';

function build(opts: { termsAccepted?: boolean } = {}) {
  const manager = { tx: true };
  const usersService = {
    findByEmail: jest.fn(),
    update: jest.fn(),
    createWithin: jest.fn(async (dto: any, work: (u: any, m: any) => Promise<unknown>) => {
      const user = { id: 'u1', email: dto.email, role: 'user' };
      const result = await work(user, manager);
      return { user, result };
    }),
  };
  const termsService = {
    accept: jest.fn(),
    hasAcceptedCurrent: jest.fn().mockResolvedValue(opts.termsAccepted ?? true),
    currentVersion: jest.fn().mockReturnValue('1.1'),
    ensureAccepted: jest.fn(),
  };
  const auditService = { log: jest.fn() };
  const service = new AuthService(
    usersService as any,
    termsService as any,
    { sign: jest.fn().mockReturnValue('signed'), verify: jest.fn() } as any,
    auditService as any,
    { isUserDeactivated: jest.fn().mockResolvedValue(false) } as any,
    { sendAdminAlert: jest.fn() } as any,
    { emit: jest.fn() } as any,
    { get: jest.fn() } as any,
    { hash: jest.fn().mockResolvedValue(BCRYPT), verify: jest.fn().mockResolvedValue(true) } as any,
    { validate: jest.fn() } as any,
  );
  return { service, usersService, termsService, auditService, manager };
}

describe('AuthService terms handling (#1353)', () => {
  it('registers the user, terms acceptance and audit entry in one transaction', async () => {
    const { service, termsService, auditService, manager } = build();
    await service.register({ email: 'A@b.c', password: 'password1', firstName: 'A', lastName: 'B' });
    expect(termsService.accept).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }), manager);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.register' }), manager);
  });

  it('leaves no orphan user when terms acceptance fails (error propagates out of the transaction)', async () => {
    const { service, termsService } = build();
    termsService.accept.mockRejectedValue(new Error('terms insert failed'));
    await expect(
      service.register({ email: 'a@b.c', password: 'password1', firstName: 'A', lastName: 'B' }),
    ).rejects.toThrow('terms insert failed');
  });

  const user = {
    id: 'u1',
    email: 'a@b.c',
    role: 'user',
    isActive: true,
    require2fa: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordHash: BCRYPT,
  };

  it('lets an existing user log in after the terms version is bumped, with a requiresAction flag', async () => {
    const { service, usersService } = build({ termsAccepted: false });
    usersService.findByEmail.mockResolvedValue(user);
    await expect(service.login({ email: 'a@b.c', password: 'password1' })).resolves.toEqual({
      accessToken: 'signed',
      requiresAction: 'accept_terms',
      version: '1.1',
    });
  });

  it('returns a plain token when the current terms are accepted', async () => {
    const { service, usersService } = build({ termsAccepted: true });
    usersService.findByEmail.mockResolvedValue(user);
    await expect(service.login({ email: 'a@b.c', password: 'password1' })).resolves.toEqual({
      accessToken: 'signed',
    });
  });
});
