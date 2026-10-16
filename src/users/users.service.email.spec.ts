import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService email handling', () => {
  const build = (existing: unknown = null) => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'u1', ...v })),
    };
    const service = new UsersService(repo as any, {} as any, {} as any);
    return { service, repo };
  };

  it('creates users with a normalised email', async () => {
    const { service, repo } = build();
    const user = await service.create({
      email: '  Alice@Example.com ',
      passwordHash: 'h',
      firstName: 'A',
      lastName: 'B',
    });
    expect(user.email).toBe('alice@example.com');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { email: 'alice@example.com' } });
  });

  it('treats a different casing of an existing address as a conflict', async () => {
    const { service } = build({ id: 'existing', email: 'alice@example.com' });
    await expect(
      service.create({ email: 'ALICE@example.com', passwordHash: 'h', firstName: 'A', lastName: 'B' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('looks users up case-insensitively', async () => {
    const { service, repo } = build();
    await service.findByEmail(' Alice@Example.COM');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { email: 'alice@example.com' } });
  });

  it('runs creation and follow-up work in one transaction', async () => {
    const manager = { getRepository: jest.fn() };
    const created = { id: 'u1', email: 'a@b.c' };
    const repo = {
      manager: { transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)) },
    };
    const service = new UsersService(repo as any, {} as any, {} as any);
    jest.spyOn(service, 'create').mockResolvedValue(created as any);
    const work = jest.fn().mockResolvedValue('done');

    const out = await service.createWithin(
      { email: 'a@b.c', passwordHash: 'h', firstName: 'A', lastName: 'B' },
      work,
    );
    expect(work).toHaveBeenCalledWith(created, manager);
    expect(out).toEqual({ user: created, result: 'done' });
  });
});
