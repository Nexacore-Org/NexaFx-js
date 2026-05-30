import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RefreshToken } from './refresh-token.entity';

describe('AuthService', () => {
  const secrets = {
    'jwt.secret': 'access-secret',
    'jwt.expiry': 3600,
    'refreshToken.secret': 'refresh-secret',
    'refreshToken.expiry': 604800,
  } as const;

  let refreshTokenRepository: jest.Mocked<
    Pick<Repository<RefreshToken>, 'findOne' | 'save' | 'update'>
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  let configService: { get: jest.Mock };
  let authService: AuthService;

  const hashToken = (token: string): string =>
    createHash('sha256').update(token).digest('hex');

  beforeEach(() => {
    refreshTokenRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };

    configService = {
      get: jest.fn((key: keyof typeof secrets) => secrets[key]),
    };

    authService = new AuthService(
      refreshTokenRepository as unknown as Repository<RefreshToken>,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('issues and persists a new refresh token family', async () => {
    jwtService.signAsync
      .mockResolvedValueOnce('signed-refresh-token')
      .mockResolvedValueOnce('signed-access-token');
    refreshTokenRepository.save.mockResolvedValue({} as RefreshToken);

    const tokenPair = await authService.issueTokenPair('user-123');

    expect(tokenPair).toEqual({
      accessToken: 'signed-access-token',
      refreshToken: 'signed-refresh-token',
    });
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sub: 'user-123',
      }),
      expect.objectContaining({
        secret: 'refresh-secret',
        expiresIn: 604800,
      }),
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sub: 'user-123',
      }),
      expect.objectContaining({
        secret: 'access-secret',
        expiresIn: 3600,
      }),
    );
    expect(refreshTokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        tokenHash: hashToken('signed-refresh-token'),
        revokedAt: null,
        replacedByTokenId: null,
      }),
    );
  });

  it('rotates a refresh token and revokes the old token', async () => {
    const rawRefreshToken = 'existing-refresh-token';
    const currentToken = {
      id: '11111111-1111-1111-1111-111111111111',
      userId: 'user-123',
      familyId: '22222222-2222-2222-2222-222222222222',
      tokenHash: hashToken(rawRefreshToken),
      parentTokenId: null,
      replacedByTokenId: null,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
      lastUsedAt: null,
    } as RefreshToken;

    jwtService.verifyAsync.mockResolvedValue({
      sub: currentToken.userId,
      jti: currentToken.id,
      familyId: currentToken.familyId,
    });
    jwtService.signAsync
      .mockResolvedValueOnce('rotated-refresh-token')
      .mockResolvedValueOnce('rotated-access-token');
    refreshTokenRepository.findOne.mockResolvedValue(currentToken);
    refreshTokenRepository.save.mockResolvedValue({} as RefreshToken);
    refreshTokenRepository.update.mockResolvedValue({
      affected: 1,
      raw: [],
      generatedMaps: [],
    });

    const tokenPair = await authService.refresh(rawRefreshToken);

    expect(tokenPair).toEqual({
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
    });
    expect(refreshTokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        familyId: currentToken.familyId,
        parentTokenId: currentToken.id,
        tokenHash: hashToken('rotated-refresh-token'),
        revokedAt: null,
      }),
    );
    expect(refreshTokenRepository.update).toHaveBeenCalledWith(
      { id: currentToken.id },
      expect.any(Object),
    );

    const updateCall = refreshTokenRepository.update.mock.calls[0];
    const updatePayload = updateCall[1] as Partial<RefreshToken>;
    expect(updatePayload.revokedAt).toBeInstanceOf(Date);
    expect(updatePayload.lastUsedAt).toBeInstanceOf(Date);
    expect(updatePayload.replacedByTokenId).toEqual(expect.any(String));
  });

  it('revokes the entire family when a revoked token is replayed', async () => {
    const rawRefreshToken = 'replayed-refresh-token';
    const compromisedToken = {
      id: '33333333-3333-3333-3333-333333333333',
      userId: 'user-123',
      familyId: '44444444-4444-4444-4444-444444444444',
      tokenHash: hashToken(rawRefreshToken),
      parentTokenId: null,
      replacedByTokenId: '55555555-5555-5555-5555-555555555555',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      createdAt: new Date(),
      lastUsedAt: new Date(),
    } as RefreshToken;

    jwtService.verifyAsync.mockResolvedValue({
      sub: compromisedToken.userId,
      jti: compromisedToken.id,
      familyId: compromisedToken.familyId,
    });
    refreshTokenRepository.findOne.mockResolvedValue(compromisedToken);
    refreshTokenRepository.update.mockResolvedValue({
      affected: 2,
      raw: [],
      generatedMaps: [],
    });

    await expect(authService.refresh(rawRefreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshTokenRepository.update).toHaveBeenCalledWith(
      { familyId: compromisedToken.familyId },
      expect.any(Object),
    );

    const familyRevokeCall = refreshTokenRepository.update.mock.calls[0];
    const familyRevokePayload = familyRevokeCall[1] as Partial<RefreshToken>;
    expect(familyRevokePayload.revokedAt).toBeInstanceOf(Date);
  });

  it('revokes a refresh token on logout', async () => {
    const rawRefreshToken = 'active-refresh-token';
    const activeToken = {
      id: '66666666-6666-6666-6666-666666666666',
      userId: 'user-123',
      familyId: '77777777-7777-7777-7777-777777777777',
      tokenHash: hashToken(rawRefreshToken),
      parentTokenId: null,
      replacedByTokenId: null,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
      lastUsedAt: null,
    } as RefreshToken;

    jwtService.verifyAsync.mockResolvedValue({
      sub: activeToken.userId,
      jti: activeToken.id,
      familyId: activeToken.familyId,
    });
    refreshTokenRepository.findOne.mockResolvedValue(activeToken);
    refreshTokenRepository.update.mockResolvedValue({
      affected: 1,
      raw: [],
      generatedMaps: [],
    });

    await expect(authService.logout(rawRefreshToken)).resolves.toEqual({
      revoked: true,
    });
    expect(refreshTokenRepository.update).toHaveBeenCalledWith(
      { id: activeToken.id },
      expect.any(Object),
    );

    const logoutCall = refreshTokenRepository.update.mock.calls[0];
    const logoutPayload = logoutCall[1] as Partial<RefreshToken>;
    expect(logoutPayload.revokedAt).toBeInstanceOf(Date);
    expect(logoutPayload.lastUsedAt).toBeInstanceOf(Date);
  });
});
