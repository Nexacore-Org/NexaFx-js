import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Issue #1534: every new lockout alerts the owner and admins, not only the one at count == 5. */
function build(recordResult: Record<string, unknown>) {
  const user = {
    id: 'u1',
    email: 'user@example.com',
    role: 'user',
    isActive: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordHash: '$2a$12$hash',
  };
  const usersService = {
    findByEmail: jest.fn().mockResolvedValue(user),
    recordFailedLogin: jest.fn().mockResolvedValue(recordResult),
  };
  const mailService = { sendAccountLockedEmail: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const passwordService = { verify: jest.fn().mockResolvedValue(false), hash: jest.fn().mockResolvedValue('$2a$12$d') };
  const service = new AuthService(
    usersService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    mailService as any,
    events as any,
    {} as any,
    passwordService as any,
    {} as any,
  );
  return { service, mailService, events, usersService };
}

const attempt = (service: AuthService) =>
  service.login({ email: 'user@example.com', password: 'wrong-password' } as any).catch((e) => e);

describe('AuthService lockout alerts (issue #1534)', () => {
  it('alerts for a lockout that happens after the counter was reset (count back to 5, newly locked)', async () => {
    const { service, mailService, events } = build({
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 30 * 60_000),
      newlyLocked: true,
    });

    const error = await attempt(service);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(mailService.sendAccountLockedEmail).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith('admin.alert.account-lockout', expect.objectContaining({ severity: 'high' }));
  });

  it('alerts even when the stored count is not exactly the threshold, as long as this call set the lock', async () => {
    const { service, mailService } = build({
      failedLoginAttempts: 7,
      lockedUntil: new Date(Date.now() + 30 * 60_000),
      newlyLocked: true,
    });

    await attempt(service);

    expect(mailService.sendAccountLockedEmail).toHaveBeenCalledTimes(1);
  });

  it('does not alert for an attempt that did not newly lock (already locked or below threshold)', async () => {
    const { service, mailService, events } = build({
      failedLoginAttempts: 6,
      lockedUntil: new Date(Date.now() + 10 * 60_000),
      newlyLocked: false,
    });

    await attempt(service);

    expect(mailService.sendAccountLockedEmail).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('a failing notification never changes the login response', async () => {
    const { service, mailService } = build({
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 30 * 60_000),
      newlyLocked: true,
    });
    mailService.sendAccountLockedEmail.mockRejectedValue(new Error('smtp down'));

    await expect(attempt(service)).resolves.toBeInstanceOf(UnauthorizedException);
  });
});
