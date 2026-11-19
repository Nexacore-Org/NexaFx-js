import { NotFoundException } from '@nestjs/common';
import { SessionsController } from './sessions.controller';

/** Issue #1538 */
function build() {
  const tokens = {
    findActiveDevices: jest.fn().mockResolvedValue([
      { tokenId: 's1', deviceName: 'Pixel', deviceOs: 'Android', lastUsedAt: new Date(), ipAddress: '1.1.1.1', createdAt: new Date() },
      { tokenId: 's2', deviceName: null, deviceOs: null, lastUsedAt: null, ipAddress: null, createdAt: new Date() },
    ]),
    revokeToken: jest.fn(),
    revokeAllExcept: jest.fn().mockResolvedValue(1),
  };
  return { controller: new (SessionsController as any)(tokens, { log: jest.fn() }) as SessionsController, tokens };
}

describe('SessionsController (issue #1538)', () => {
  it('marks exactly the current session as isCurrent', async () => {
    const { controller } = build();

    const { sessions } = await controller.listSessions({ user: { sub: 'u1', sid: 's1' } });

    expect(sessions.map((s) => [s.tokenId, s.isCurrent])).toEqual([['s1', true], ['s2', false]]);
  });

  it('shows placeholders for unknown device info', async () => {
    const { controller } = build();
    const { sessions } = await controller.listSessions({ user: { sub: 'u1', sid: 's1' } });
    expect(sessions[1]).toMatchObject({ deviceName: 'Unknown device', deviceOs: 'Unknown OS' });
  });

  it('revoking another user\'s (or a missing) session is a 404', async () => {
    const { controller, tokens } = build();
    tokens.revokeToken.mockResolvedValue(false);

    await expect(controller.revokeSession('foreign', { user: { sub: 'u1' } })).rejects.toBeInstanceOf(NotFoundException);
    expect(tokens.revokeToken).toHaveBeenCalledWith('u1', 'foreign');
  });

  it('revoking your own session succeeds', async () => {
    const { controller, tokens } = build();
    tokens.revokeToken.mockResolvedValue(true);
    await expect(controller.revokeSession('s2', { user: { sub: 'u1' } })).resolves.toBeUndefined();
  });

  it('revoke-all keeps the current session', async () => {
    const { controller, tokens } = build();
    await controller.revokeAllSessions({ user: { sub: 'u1', sid: 's1' } });
    expect(tokens.revokeAllExcept).toHaveBeenCalledWith('u1', 's1');
  });
});
