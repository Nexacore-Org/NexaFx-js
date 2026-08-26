import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomUUID();
    const familyId = randomUUID();
    const expirySeconds = this.configService.get<number>('refreshToken.expiry', 604800);
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    const entity = this.refreshTokenRepo.create({
      id: randomUUID(),
      userId,
      familyId,
      tokenHash: this.hashToken(token),
      expiresAt,
      deviceName: deviceInfo?.deviceName ?? null,
      deviceOs: deviceInfo?.deviceOs ?? null,
      ipAddress: deviceInfo?.ipAddress ?? null,
    });
    await this.refreshTokenRepo.save(entity);

    return { token, expiresAt };
  }

  async rotateToken(
    oldToken: string,
    deviceInfo?: { deviceName?: string; deviceOs?: string; ipAddress?: string },
  ): Promise<{ token: string; expiresAt: Date }> {
    const existing = await this.refreshTokenRepo.findOne({
      where: { tokenHash: this.hashToken(oldToken) },
    });
    if (!existing || existing.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked refresh token');
    }

    const now = new Date();
    if (existing.expiresAt < now) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const newToken = randomUUID();
    const expirySeconds = this.configService.get<number>('refreshToken.expiry', 604800);
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    const newEntity = this.refreshTokenRepo.create({
      id: randomUUID(),
      userId: existing.userId,
      familyId: existing.familyId,
      parentTokenId: existing.id,
      tokenHash: this.hashToken(newToken),
      expiresAt,
      deviceName: deviceInfo?.deviceName ?? existing.deviceName,
      deviceOs: deviceInfo?.deviceOs ?? existing.deviceOs,
      ipAddress: deviceInfo?.ipAddress ?? existing.ipAddress,
    });

    existing.replacedByTokenId = newEntity.id;
    existing.revokedAt = now;

    await this.refreshTokenRepo.save([existing, newEntity]);

    return { token: newToken, expiresAt };
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
      where: { userId, revokedAt: null },
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
      { userId, revokedAt: null, id: { $ne: currentTokenId } as any },
      { revokedAt: new Date() },
    );
    return result.affected ?? 0;
  }
}
