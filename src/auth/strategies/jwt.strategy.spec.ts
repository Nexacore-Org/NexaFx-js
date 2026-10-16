import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload, JwtStrategy } from './jwt.strategy';
import { UsersService } from '../../users/users.service';

const mockConfig = {
  get: (key: string) => {
    if (key === 'jwt.secret') return 'test-secret';
    return undefined;
  },
} as unknown as ConfigService;

const makeStrategy = (usersService: Partial<UsersService>, accountStatus?: unknown) =>
  new JwtStrategy(mockConfig, usersService as UsersService, accountStatus as any);

const basePayload = (iat: number): JwtPayload => ({
  sub: 'user-1',
  email: 'user@example.com',
  role: 'user',
  isEmailVerified: true,
  typ: 'access',
  iat,
});

describe('JwtStrategy.validate', () => {
  it('returns user data when token is valid and no password change has occurred', async () => {
    const usersService = {
      findByIdOrNull: jest.fn().mockResolvedValue({
        id: 'user-1',
        passwordChangedAt: null,
      }),
    };
    const strategy = makeStrategy(usersService);
    const result = await strategy.validate(basePayload(1000));
    expect(result).toEqual({
      id: 'user-1',
      sub: 'user-1',
      email: 'user@example.com',
      role: 'user',
      isEmailVerified: true,
    });
  });

  it.each(['refresh', 'sep10', 'export-download', undefined])(
    'rejects a token with typ=%s',
    async (typ) => {
      const strategy = makeStrategy({ findByIdOrNull: jest.fn().mockResolvedValue({ id: 'user-1' }) });
      await expect(
        strategy.validate({ ...basePayload(1000), typ } as JwtPayload),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('rejects a token without sub', async () => {
    const strategy = makeStrategy({ findByIdOrNull: jest.fn() });
    await expect(
      strategy.validate({ ...basePayload(1000), sub: '' } as JwtPayload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects token issued before password change', async () => {
    const changedAt = new Date('2024-01-01T12:00:00Z');
    const iatBeforeChange = Math.floor(changedAt.getTime() / 1000) - 60;
    const usersService = {
      findByIdOrNull: jest.fn().mockResolvedValue({
        id: 'user-1',
        passwordChangedAt: changedAt,
      }),
    };
    const strategy = makeStrategy(usersService);
    await expect(strategy.validate(basePayload(iatBeforeChange))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts token issued after password change', async () => {
    const changedAt = new Date('2024-01-01T12:00:00Z');
    const iatAfterChange = Math.floor(changedAt.getTime() / 1000) + 60;
    const usersService = {
      findByIdOrNull: jest.fn().mockResolvedValue({
        id: 'user-1',
        passwordChangedAt: changedAt,
      }),
    };
    const strategy = makeStrategy(usersService);
    await expect(strategy.validate(basePayload(iatAfterChange))).resolves.toMatchObject({
      id: 'user-1',
    });
  });

  it('rejects when user no longer exists', async () => {
    const usersService = {
      findByIdOrNull: jest.fn().mockResolvedValue(null),
    };
    const strategy = makeStrategy(usersService);
    await expect(strategy.validate(basePayload(9999))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a suspended or deactivated user even with a valid token', async () => {
    const usersService = {
      findByIdOrNull: jest.fn().mockResolvedValue({ id: 'user-1', passwordChangedAt: null }),
    };
    const strategy = makeStrategy(usersService, {
      isAllowedToAuthenticate: jest.fn().mockResolvedValue(false),
    });
    await expect(strategy.validate(basePayload(9999))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
