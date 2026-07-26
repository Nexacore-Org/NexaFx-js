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

const makeStrategy = (usersService: Partial<UsersService>) =>
  new JwtStrategy(mockConfig, usersService as UsersService);

const basePayload = (iat: number): JwtPayload => ({
  sub: 'user-1',
  email: 'user@example.com',
  role: 'user',
  isEmailVerified: true,
  iat,
});

describe('JwtStrategy.validate', () => {
  it('returns user data when token is valid and no password change has occurred', async () => {
    const usersService = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-1',
        passwordChangedAt: null,
      }),
    };
    const strategy = makeStrategy(usersService);
    const result = await strategy.validate(basePayload(1000));
    expect(result).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      isEmailVerified: true,
    });
  });

  it('rejects token issued before password change', async () => {
    const changedAt = new Date('2024-01-01T12:00:00Z');
    const iatBeforeChange = Math.floor(changedAt.getTime() / 1000) - 60;
    const usersService = {
      findById: jest.fn().mockResolvedValue({
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
      findById: jest.fn().mockResolvedValue({
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
      findById: jest.fn().mockResolvedValue(null),
    };
    const strategy = makeStrategy(usersService);
    await expect(strategy.validate(basePayload(9999))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
