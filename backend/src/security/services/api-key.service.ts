import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { randomBytes, createHash } from 'crypto';

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
  permissions?: string[];
  rateLimit?: {
    max: number;
    windowMs: number;
  };
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);
  private readonly API_KEY_PREFIX = 'api_key:';
  private readonly USER_KEYS_PREFIX = 'user_keys:';

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async generateApiKey(
    userId: string,
    name: string,
    permissions?: string[],
    expiresInDays?: number,
  ): Promise<{ apiKey: string; keyData: ApiKey }> {
    const keyId = this.generateId();
    const rawKey = this.generateRawKey();
    const prefix = rawKey.substring(0, 8);
    const keyHash = this.hashKey(rawKey);

    const apiKey: ApiKey = {
      id: keyId,
      userId,
      name,
      keyHash,
      prefix,
      createdAt: new Date(),
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : undefined,
      isActive: true,
      permissions,
      rateLimit: {
        max: 600,
        windowMs: 60 * 1000,
      },
    };

    await this.redis.set(
      `${this.API_KEY_PREFIX}${keyHash}`,
      JSON.stringify(apiKey),
    );

    await this.redis.sadd(`${this.USER_KEYS_PREFIX}${userId}`, keyId);

    this.logger.log(`API key generated for user ${userId}`);

    return {
      apiKey: rawKey,
      keyData: apiKey,
    };
  }

  async validateApiKey(rawKey: string): Promise<ApiKey | null> {
    try {
      const keyHash = this.hashKey(rawKey);
      const data = await this.redis.get(`${this.API_KEY_PREFIX}${keyHash}`);

      if (!data) {
        return null;
      }

      const apiKey = JSON.parse(data) as ApiKey;

      if (!apiKey.isActive) {
        return null;
      }

      if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
        await this.revokeApiKey(apiKey.id);
        return null;
      }

      await this.updateLastUsed(keyHash);

      return apiKey;
    } catch (err) {
      this.logger.error('Error validating API key:', err);
      return null;
    }
  }

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    try {
      const keyIds = await this.redis.smembers(
        `${this.USER_KEYS_PREFIX}${userId}`,
      );

      const keys: ApiKey[] = [];

      for (const keyId of keyIds) {
        const keyData = await this.getKeyById(keyId);
        if (keyData) {
          keys.push(keyData);
        }
      }

      return keys;
    } catch (err) {
      this.logger.error(`Error getting API keys for user ${userId}:`, err);
      return [];
    }
  }

  async revokeApiKey(keyId: string): Promise<void> {
    try {
      const keyData = await this.getKeyById(keyId);

      if (!keyData) {
        return;
      }

      await this.redis.del(`${this.API_KEY_PREFIX}${keyData.keyHash}`);
      await this.redis.srem(`${this.USER_KEYS_PREFIX}${keyData.userId}`, keyId);

      this.logger.log(`API key ${keyId} revoked`);
    } catch (err) {
      this.logger.error(`Error revoking API key ${keyId}:`, err);
    }
  }

  async rotateApiKey(
    keyId: string,
  ): Promise<{ apiKey: string; keyData: ApiKey } | null> {
    try {
      const oldKeyData = await this.getKeyById(keyId);

      if (!oldKeyData) {
        return null;
      }

      await this.revokeApiKey(keyId);

      return await this.generateApiKey(
        oldKeyData.userId,
        oldKeyData.name,
        oldKeyData.permissions,
      );
    } catch (err) {
      this.logger.error(`Error rotating API key ${keyId}:`, err);
      return null;
    }
  }

  private async getKeyById(keyId: string): Promise<ApiKey | null> {
    try {
      const keys = await this.redis.keys(`${this.API_KEY_PREFIX}*`);

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const apiKey = JSON.parse(data) as ApiKey;
          if (apiKey.id === keyId) {
            return apiKey;
          }
        }
      }

      return null;
    } catch (err) {
      this.logger.error(`Error getting key by ID ${keyId}:`, err);
      return null;
    }
  }

  private async updateLastUsed(keyHash: string): Promise<void> {
    try {
      const data = await this.redis.get(`${this.API_KEY_PREFIX}${keyHash}`);
      if (data) {
        const apiKey = JSON.parse(data) as ApiKey;
        apiKey.lastUsedAt = new Date();
        await this.redis.set(
          `${this.API_KEY_PREFIX}${keyHash}`,
          JSON.stringify(apiKey),
        );
      }
    } catch (err) {
      this.logger.error('Error updating last used:', err);
    }
  }

  private generateRawKey(): string {
    return `sk_${randomBytes(32).toString('hex')}`;
  }

  private generateId(): string {
    return `key_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  private hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }
}
