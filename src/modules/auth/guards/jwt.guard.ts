import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { SecretsService } from '../../secrets/services/secrets.service';
import { AuthService } from '../auth.service';
import { CacheService } from '../../cache/services/cache.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly secretsService: SecretsService,
    private readonly authService: AuthService,
    private readonly cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('JWT token required');
    }

    const token = authHeader.split(' ')[1];
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Session revocation check — max 1 DB hit per 5s per token
    const revoked = await this.cacheService.isSessionRevoked(tokenHash);
    if (revoked === true) {
      throw new UnauthorizedException('Session has been revoked');
    }

    const secrets = await this.secretsService.getValidSecrets('JWT');

    for (const secret of secrets) {
      try {
        const payload: any = jwt.verify(token, secret);

        const isValid = await this.authService.verifyUserIsActive(payload.sub || payload.id);
        if (!isValid) {
          throw new UnauthorizedException('Account has been deactivated');
        }

        request.user = payload;
        return true;
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
      }
    }

    throw new UnauthorizedException('Invalid or expired JWT token');
  }
}
