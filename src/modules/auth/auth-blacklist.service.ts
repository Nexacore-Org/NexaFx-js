// src/modules/auth/auth-blacklist.service.ts
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service'; // Assuming a Redis provider

@Injectable()
export class AuthBlacklistService {
  constructor(private redis: RedisService) {}

  async revokeUserSessions(userId: string) {
    // Set a "Revoked At" timestamp for the user
    await this.redis.set(`revoked:${userId}`, Date.now().toString());
  }

  async isTokenRevoked(userId: string, issuedAt: number): Promise<boolean> {
    const revokedAt = await this.redis.get(`revoked:${userId}`);
    return revokedAt ? issuedAt < parseInt(revokedAt) : false;
  }
}

// Integration into your JwtGuard
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private blacklist: AuthBlacklistService) { super(); }

  async canActivate(context: ExecutionContext) {
    const isValid = await super.canActivate(context);
    if (!isValid) return false;

    const { user, iat } = context.switchToHttp().getRequest();
    const isRevoked = await this.blacklist.isTokenRevoked(user.id, iat * 1000);
    
    if (isRevoked) throw new UnauthorizedException('Session has been revoked');
    return true;
  }
}