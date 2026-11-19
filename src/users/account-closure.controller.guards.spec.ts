import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { AccountClosureController } from './account-closure.controller';
import { UsersService } from './users.service';

describe('POST /users/me/close-account protections (issue #1530)', () => {
  it('is throttled to 3 attempts per 15 minutes', () => {
    const handler = AccountClosureController.prototype.closeAccount;
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(3);
    expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(900_000);
  });

  it('re-registering a closed (soft-deleted) email is a clear 409, not a unique-index 500', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 'old', deletedAt: new Date() });
    const repo = { findOne, create: jest.fn(), save: jest.fn() };
    const service = new UsersService(repo as any, {} as any, {} as any);

    await expect(
      service.create({ email: 'Closed@Example.com', passwordHash: 'h', firstName: 'A', lastName: 'B' }),
    ).rejects.toThrow('Email already in use');

    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true }));
    expect(repo.save).not.toHaveBeenCalled();
  });
});
