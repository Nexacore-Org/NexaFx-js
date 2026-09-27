import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserResolver } from './user.resolver';
import { UsersService } from '../users/users.service';

describe('UserResolver access scoping', () => {
  const record = {
    id: 'user-1',
    email: 'alice@example.com',
    kycStatus: 'verified',
  };

  let usersService: { findById: jest.Mock };
  let resolver: UserResolver;

  const contextFor = (user?: Record<string, unknown>) => ({ req: { user } });

  beforeEach(() => {
    usersService = { findById: jest.fn().mockResolvedValue(record) };
    resolver = new UserResolver(usersService as unknown as UsersService);
  });

  it('returns the caller their own record', async () => {
    await expect(
      resolver.user('user-1', contextFor({ sub: 'user-1' })),
    ).resolves.toEqual(record);
    expect(usersService.findById).toHaveBeenCalledWith('user-1');
  });

  it("refuses a non-admin caller another user's record", async () => {
    await expect(
      resolver.user('victim-1', contextFor({ sub: 'user-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it("allows an admin to read another user's record via the role claim", async () => {
    await expect(
      resolver.user('victim-1', contextFor({ sub: 'admin-1', role: 'admin' })),
    ).resolves.toEqual(record);
    expect(usersService.findById).toHaveBeenCalledWith('victim-1');
  });

  it("allows an admin to read another user's record via the roles claim", async () => {
    await expect(
      resolver.user(
        'victim-1',
        contextFor({ sub: 'admin-1', roles: ['support', 'admin'] }),
      ),
    ).resolves.toEqual(record);
  });

  it('rejects an unauthenticated caller', async () => {
    await expect(
      resolver.user('user-1', contextFor(undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('resolves me() from the token, ignoring any supplied id', async () => {
    await expect(resolver.me(contextFor({ sub: 'user-1' }))).resolves.toEqual(
      record,
    );
    expect(usersService.findById).toHaveBeenCalledWith('user-1');
  });

  it('rejects me() without authentication', async () => {
    await expect(resolver.me(contextFor(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
