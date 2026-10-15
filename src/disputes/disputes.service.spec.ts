import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DisputesService } from './disputes.service';

const makeService = (dispute: any) => {
  const disputeRepo = {
    // Behaves like a real scoped lookup: only matches when every key in `where` matches.
    findOne: jest.fn(async ({ where }: any) =>
      dispute && Object.entries(where).every(([k, v]) => dispute[k] === v) ? { ...dispute } : null,
    ),
    save: jest.fn(async (d: any) => d),
  };
  const messageRepo = {
    create: jest.fn((m: any) => m),
    save: jest.fn(async (m: any) => m),
  };
  const events = { emit: jest.fn() };
  const svc = new DisputesService(
    disputeRepo as any,
    messageRepo as any,
    {} as any,
    {} as any,
    events as any,
  );
  return { svc, disputeRepo, messageRepo };
};

const open = { id: 'd1', userId: 'owner', status: 'open' };

describe('DisputesService ownership', () => {
  it.each(['resolve', 'reject'] as const)('%s: rejects a different user with 404', async (verb) => {
    const { svc, disputeRepo } = makeService(open);
    await expect(svc[verb]('d1', 'attacker')).rejects.toBeInstanceOf(NotFoundException);
    expect(disputeRepo.save).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)('%s: lets the owner close an open dispute', async (verb) => {
    const { svc } = makeService(open);
    const result = await svc[verb]('d1', 'owner');
    expect(result.data.status).toBe(verb === 'resolve' ? 'resolved' : 'rejected');
  });

  it.each(['resolve', 'reject'] as const)('%s: refuses an already-closed dispute', async (verb) => {
    for (const status of ['resolved', 'rejected']) {
      const { svc, disputeRepo } = makeService({ ...open, status });
      await expect(svc[verb]('d1', 'owner')).rejects.toBeInstanceOf(BadRequestException);
      expect(disputeRepo.save).not.toHaveBeenCalled();
    }
  });

  it('addMessage: rejects a user posting into someone else\'s dispute', async () => {
    const { svc, messageRepo } = makeService(open);
    await expect(
      svc.addMessage('d1', 'attacker', 'user', { message: 'hi' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(messageRepo.save).not.toHaveBeenCalled();
  });

  it('addMessage: allows the owner and admin senders', async () => {
    const { svc } = makeService(open);
    await expect(svc.addMessage('d1', 'owner', 'user', { message: 'hi' } as any)).resolves.toBeTruthy();
    await expect(svc.addMessage('d1', 'admin-1', 'admin', { message: 'hi' } as any)).resolves.toBeTruthy();
  });
});
