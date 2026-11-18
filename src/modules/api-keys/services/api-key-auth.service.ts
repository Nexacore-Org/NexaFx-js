import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../users/user.entity';
import { AuthenticatedUser } from '../../../auth/authenticated-user.interface';
import { ApiKeysService } from './api-keys.service';
import { AccountStatusService } from '../../../auth/account-status.service';
import { AccountFreezeService } from '../../account-freeze/services/account-freeze.service';

const WINDOW_MS = 60 * 60 * 1000; // rateLimit is "requests per hour"

/**
 * Turns an `x-api-key` header into the same normalised principal a JWT
 * produces, so downstream guards and handlers treat both alike. Enforces the
 * key's scopes and its (server-capped) hourly rate limit.
 */
@Injectable()
export class ApiKeyAuthService {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly apiKeysService: ApiKeysService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @Optional() private readonly accountStatus?: AccountStatusService,
    @Optional() private readonly accountFreeze?: AccountFreezeService,
  ) {}

  private consumeRateLimit(keyId: string, limit: number): void {
    const now = Date.now();
    const current = this.windows.get(keyId);
    if (!current || current.resetAt <= now) {
      this.windows.set(keyId, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }
    if (current.count >= limit) {
      throw new HttpException(
        {
          message: 'API key rate limit exceeded',
          retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    current.count += 1;
  }

  async authenticate(rawKey: string, requiredScopes: string[] = []): Promise<AuthenticatedUser> {
    const key = await this.apiKeysService.validateApiKey(rawKey);

    const granted = key.scopes ?? [];
    const missing = requiredScopes.filter((scope) => !granted.includes(scope));
    if (missing.length > 0) {
      throw new ForbiddenException(`API key is missing required scope(s): ${missing.join(', ')}`);
    }

    this.consumeRateLimit(key.id, key.rateLimit);

    const owner = await this.usersRepo.findOne({ where: { id: key.userId } });
    if (!owner || owner.isActive === false) {
      throw new UnauthorizedException('API key owner is not active');
    }
    // Same answer as for JWTs: admin-suspended and deactivated owners may not authenticate.
    if (this.accountStatus && !(await this.accountStatus.isAllowedToAuthenticate(owner.id))) {
      throw new UnauthorizedException('API key owner is not active');
    }
    // A frozen owner's keys must not move money either; the money paths re-check, this fails early.
    if (this.accountFreeze && (await this.accountFreeze.isAccountFrozen(owner.id))) {
      throw new ForbiddenException('Account is frozen');
    }

    return {
      id: owner.id,
      sub: owner.id,
      email: owner.email,
      // An API key never inherits admin or compliance privileges, whatever its owner's role.
      role: 'user',
      isEmailVerified: owner.isEmailVerified,
      authMethod: 'api_key',
      scopes: granted,
      apiKeyId: key.id,
    };
  }
}
