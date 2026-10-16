import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { createHmac, randomUUID } from 'crypto';
import { RefreshToken } from '../auth/refresh-token.entity';

@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly configService: ConfigService,
  ) {}

  private getRefreshTokenSecret(): string {
    const secret = this.configService.get<string>('refreshToken.secret');
    if (!secret || secret.length < 16) {
      throw new Error('REFRESH_TOKEN_SECRET must be at least 16 characters');
    }
    return secret;
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.getRefreshTokenSecret())
      .update(token)
      .digest('hex');
  }

  async createToken(
    userId: string,
    deviceInfo?: { deviceName?: string; deviceOs?: string; ipAddress?: string },
  ): Promise<{ id: string; token: string; expiresAt: Date }> {
    const token = randomUUID();
    const familyId = randomUUID();
    const expirySeconds = this.configService.get<number>('refreshToken.expiry', 604800);
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    const id = randomUUID();
    const entity = this.refreshTokenRepo.create({
      id,
      userId,
      familyId,
      tokenHash: this.hashToken(token),
      expiresAt,
      lastUsedAt: new Date(),
      deviceName: deviceInfo?.deviceName ?? null,
      deviceOs: deviceInfo?.deviceOs ?? null,
      ipAddress: deviceInfo?.ipAddress ?? null,
    });
    await this.refreshTokenRepo.save(entity);

    return { id, token, expiresAt };
  }

  async rotateToken(
    oldToken: string,
    deviceInfo?: { deviceName?: string; deviceOs?: string; ipAddress?: string },
  ): Promise<{ id: string; userId: string; token: string; expiresAt: Date }> {
    const existing = await this.refreshTokenRepo.findOne({
      where: { tokenHash: this.hashToken(oldToken) },
    });
    if (!existing) {
      throw new UnauthorizedException('Invalid or revoked refresh token');
    }
    if (existing.revokedAt) {
      // Presenting a token that was already rotated means it leaked or was
      // replayed: kill every token in its family so neither party keeps access.
      if (existing.replacedByTokenId) {
        await this.refreshTokenRepo.update(
          { familyId: existing.familyId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
      }
      throw new UnauthorizedException('Invalid or revoked refresh token');
    }

    const now = new Date();
    if (existing.expiresAt < now) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const newToken = randomUUID();
    const expirySeconds = this.configService.get<number>('refreshToken.expiry', 604800);
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    const newId = randomUUID();
    const newEntity = this.refreshTokenRepo.create({
      id: newId,
      userId: existing.userId,
      familyId: existing.familyId,
      parentTokenId: existing.id,
      tokenHash: this.hashToken(newToken),
      expiresAt,
      deviceName: deviceInfo?.deviceName ?? existing.deviceName,
      deviceOs: deviceInfo?.deviceOs ?? existing.deviceOs,
      ipAddress: deviceInfo?.ipAddress ?? existing.ipAddress,
      lastUsedAt: now,
    });

    existing.replacedByTokenId = newEntity.id;
    existing.revokedAt = now;
    existing.lastUsedAt = now;

    await this.refreshTokenRepo.save([existing, newEntity]);

    return { id: newId, userId: existing.userId, token: newToken, expiresAt };
  }

  async revokeUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepo.update({ userId }, { revokedAt: new Date() });
  }

  async findActiveDevices(userId: string): Promise<Array<{
    tokenId: string;
    deviceName: string | null;
    deviceOs: string | null;
    lastUsedAt: Date | null;
    ipAddress: string | null;
    createdAt: Date;
  }>> {
    const tokens = await this.refreshTokenRepo.find({
      where: { userId, revokedAt: IsNull() },
      order: { lastUsedAt: 'DESC', createdAt: 'DESC' },
    });

    return tokens.map((t) => ({
      tokenId: t.id,
      deviceName: t.deviceName,
      deviceOs: t.deviceOs,
      lastUsedAt: t.lastUsedAt,
      ipAddress: t.ipAddress,
      createdAt: t.createdAt,
    }));
  }

  async revokeToken(userId: string, tokenId: string): Promise<boolean> {
    const token = await this.refreshTokenRepo.findOne({
      where: { id: tokenId, userId },
    });
    if (!token || token.revokedAt) return false;
    token.revokedAt = new Date();
    await this.refreshTokenRepo.save(token);
    return true;
  }

  async revokeAllExcept(userId: string, currentTokenId: string): Promise<number> {
    const result = await this.refreshTokenRepo.update(
      { userId, revokedAt: IsNull(), ...(currentTokenId ? { id: Not(currentTokenId) } : {}) },
      { revokedAt: new Date() },
    );
    return result.affected ?? 0;
  }

  /** Revoke the token matching a raw refresh token value (logout). */
  async revokeByRawToken(userId: string, rawToken: string): Promise<boolean> {
    const token = await this.refreshTokenRepo.findOne({
      where: { userId, tokenHash: this.hashToken(rawToken) },
    });
    if (!token || token.revokedAt) return false;
    token.revokedAt = new Date();
    await this.refreshTokenRepo.save(token);
    return true;
  }
}
