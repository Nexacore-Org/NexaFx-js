import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SecretName = 'JWT' | 'REFRESH_TOKEN';

/**
 * Single source of truth for signing secrets, backed by the same config values
 * JwtAuthGuard verifies with (issue #1385).
 */
@Injectable()
export class SecretsService {
  constructor(private readonly config: ConfigService) {}

  async getActiveSecret(name: SecretName): Promise<string> {
    const key = name === 'JWT' ? 'jwt.secret' : 'refreshToken.secret';
    const secret = this.config.get<string>(key);
    if (!secret) {
      throw new Error(`Secret "${name}" (${key}) is not configured`);
    }
    return secret;
  }
}
