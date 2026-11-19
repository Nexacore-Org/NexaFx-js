import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { createHmac, randomUUID } from 'crypto';
import { RefreshToken } from '../auth/refresh-token.entity';

/** How long an `isSessionActive` answer is reused. Must stay well under the access token lifetime. */
const SESSION_CACHE_TTL_MS = 5_000;

@Injectable()
export class RefreshTokensService {
  private readonly sessionCache = new Map<string, { active: boolean; expiresAt: number }>();

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

  /**
   * Rotate a refresh token. The old token is *claimed* with one conditional UPDATE
   * (`WHERE revokedAt IS NULL`), so two parallel refreshes with the same token cannot both
   * mint a child: the loser claims nothing, which is treated exactly like reuse of a rotated
   * token and revokes the whole family (issue #1529).
   */
  async rotateToken(
    oldToken: string,
    deviceInfo?: { deviceName?: string; deviceOs?: string; ipAddress?: string },
  ): Promise<{ id: string; userId: string; token: string; expiresAt: Date }> {
    const outcome = await this.refreshTokenRepo.manager.transaction(async (manager) => {
      const existing = await manager.findOne(RefreshToken, {
        where: { tokenHash: this.hashToken(oldToken) },
      });
      if (!existing) {
        return { kind: 'invalid' as const };
      }
      if (existing.revokedAt) {
        // Presenting a token that was already rotated means it leaked or was replayed.
        return { kind: 'reuse' as const, familyId: existing.familyId, replayed: !!existing.replacedByTokenId };
      }

      const now = new Date();
      if (existing.expiresAt < now) {
        return { kind: 'expired' as const };
      }

      const newToken = randomUUID();
      const expirySeconds = this.configService.get<number>('refreshToken.expiry', 604800);
      const expiresAt = new Date(Date.now() + expirySeconds * 1000);
      const newId = randomUUID();

      const claim = await manager.update(
        RefreshToken,
        { id: existing.id, revokedAt: IsNull() },
        { revokedAt: now, replacedByTokenId: newId, lastUsedAt: now },
      );
      if (!claim.affected) {
        // Someone else rotated it between our read and our write.
        return { kind: 'reuse' as const, familyId: existing.familyId, replayed: true };
      }

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
      await manager.save(RefreshToken, newEntity);

      return { kind: 'rotated' as const, id: newId, userId: existing.userId, token: newToken, expiresAt, oldId: existing.id };
    });

    switch (outcome.kind) {
      case 'rotated':
        this.sessionCache.delete(`${outcome.userId}:${outcome.oldId}`);
        return { id: outcome.id, userId: outcome.userId, token: outcome.token, expiresAt: outcome.expiresAt };
      case 'reuse':
        // Outside the transaction on purpose: a throw inside it would roll the revocation back.
        if (outcome.replayed) {
          await this.refreshTokenRepo.update(
            { familyId: outcome.familyId, revokedAt: IsNull() },
            { revokedAt: new Date() },
          );
          this.sessionCache.clear();
        }
        throw new UnauthorizedException('Invalid or revoked refresh token');
      case 'expired':
        throw new UnauthorizedException('Refresh token expired');
      default:
        throw new UnauthorizedException('Invalid or revoked refresh token');
    }
  }

  /**
   * Whether the session (refresh-token row) named by an access token's `sid` is still live.
   * Answers are cached for a few seconds, far below the access token lifetime, and dropped
   * immediately on revocation made through this instance.
   */
  async isSessionActive(userId: string, sessionId: string): Promise<boolean> {
    const key = `${userId}:${sessionId}`;
    const cached = this.sessionCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.active;

    const row = await this.refreshTokenRepo.findOne({ where: { id: sessionId, userId } });
    const active = !!row && !row.revokedAt && row.expiresAt > new Date();
    this.sessionCache.set(key, { active, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
    return active;
  }

  /** Delete tokens that can never be used again (expired or revoked long ago). Returns rows removed. */
  async purgeStaleTokens(retentionDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const expired = await this.refreshTokenRepo.delete({ expiresAt: LessThan(cutoff) });
    const revoked = await this.refreshTokenRepo.delete({ revokedAt: LessThan(cutoff) });
    return (expired.affected ?? 0) + (revoked.affected ?? 0);
  }

  async revokeUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepo.update({ userId }, { revokedAt: new Date() });
    this.dropCachedSessions(userId);
  }

  private dropCachedSessions(userId: string, sessionId?: string): void {
    if (sessionId) {
      this.sessionCache.delete(`${userId}:${sessionId}`);
      return;
    }
    for (const key of this.sessionCache.keys()) {
      if (key.startsWith(`${userId}:`)) this.sessionCache.delete(key);
    }
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
    this.dropCachedSessions(userId, tokenId);
    return true;
  }

  async revokeAllExcept(userId: string, currentTokenId: string): Promise<number> {
    // Without a known current session this would revoke every session, including the caller's.
    if (!currentTokenId) {
      throw new BadRequestException('Current session could not be identified; sign in again');
    }
    const result = await this.refreshTokenRepo.update(
      { userId, revokedAt: IsNull(), id: Not(currentTokenId) },
      { revokedAt: new Date() },
    );
    this.dropCachedSessions(userId);
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
    this.dropCachedSessions(userId, token.id);
    return true;
  }
}
