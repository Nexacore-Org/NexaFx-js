import { BadRequestException } from '@nestjs/common';
import { PasswordResetFlowService } from './password-reset-flow.service';
import { TOKEN_VERSION_CHANGED_EVENT } from './token-version.service';

function build(over: { claim?: jest.Mock; policy?: jest.Mock; update?: jest.Mock; mail?: jest.Mock } = {}) {
  const manager = { tx: true };
  const usersService = {
    updatePassword: over.update ?? jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue({ id: 'user-1', email: 'user@example.com' }),
  };
  const resetService = {
    claimToken: over.claim ?? jest.fn().mockResolvedValue('user-1'),
    runInTransaction: jest.fn(async (fn: (m: unknown) => unknown) => fn(manager)),
  };
  const passwordService = { hash: jest.fn().mockResolvedValue('new-hash') };
  const passwordPolicy = { validate: over.policy ?? jest.fn() };
  const mailService = { sendPasswordChangedNotice: over.mail ?? jest.fn().mockResolvedValue(undefined) };
  const refreshTokens = { revokeUserTokens: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const service = new PasswordResetFlowService(
    usersService as any,
    resetService as any,
    passwordService as any,
    passwordPolicy as any,
    mailService as any,
    refreshTokens as any,
    { get: jest.fn() } as any,
    events as any,
  );
  return { service, usersService, resetService, passwordPolicy, mailService, refreshTokens, events, manager };
}

describe('PasswordResetFlowService.resetPassword (issue #1526)', () => {
  it('claims the token and changes the password inside one transaction', async () => {
    const { service, resetService, usersService, manager } = build();

    await service.resetPassword('raw', 'Str0ng!Passw0rd');

    expect(resetService.runInTransaction).toHaveBeenCalledTimes(1);
    expect(resetService.claimToken).toHaveBeenCalledWith('raw', manager);
    expect(usersService.updatePassword).toHaveBeenCalledWith('user-1', 'new-hash', manager);
  });

  it('a weak password never touches the token', async () => {
    const policy = jest.fn(() => {
      throw new BadRequestException('too weak');
    });
    const { service, resetService } = build({ policy });

    await expect(service.resetPassword('raw', 'weak')).rejects.toBeInstanceOf(BadRequestException);
    expect(resetService.claimToken).not.toHaveBeenCalled();
  });

  it('an unclaimable token changes nothing and revokes nothing', async () => {
    const claim = jest.fn().mockRejectedValue(new BadRequestException('Invalid or expired reset token'));
    const { service, usersService, refreshTokens, mailService } = build({ claim });

    await expect(service.resetPassword('raw', 'Str0ng!Passw0rd')).rejects.toBeInstanceOf(BadRequestException);

    expect(usersService.updatePassword).not.toHaveBeenCalled();
    expect(refreshTokens.revokeUserTokens).not.toHaveBeenCalled();
    expect(mailService.sendPasswordChangedNotice).not.toHaveBeenCalled();
  });

  it('a failure while changing the password aborts before any session is revoked', async () => {
    const update = jest.fn().mockRejectedValue(new Error('db down'));
    const { service, refreshTokens } = build({ update });

    await expect(service.resetPassword('raw', 'Str0ng!Passw0rd')).rejects.toThrow('db down');
    expect(refreshTokens.revokeUserTokens).not.toHaveBeenCalled();
  });

  it('after commit: signals the token-version change, revokes sessions and emails the owner', async () => {
    const { service, refreshTokens, mailService, events } = build();

    await service.resetPassword('raw', 'Str0ng!Passw0rd');

    expect(events.emit).toHaveBeenCalledWith(TOKEN_VERSION_CHANGED_EVENT, { userId: 'user-1' });
    expect(refreshTokens.revokeUserTokens).toHaveBeenCalledWith('user-1');
    expect(mailService.sendPasswordChangedNotice).toHaveBeenCalledWith('user@example.com');
  });

  it('a failing notification does not fail the reset', async () => {
    const mail = jest.fn().mockRejectedValue(new Error('smtp down'));
    const { service } = build({ mail });

    await expect(service.resetPassword('raw', 'Str0ng!Passw0rd')).resolves.toEqual({
      message: 'Password reset successfully.',
    });
  });
});
