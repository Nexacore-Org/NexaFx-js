import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ApiKeyEntity } from '../entities/api-key.entity';
import {
  API_KEY_DEFAULT_RATE_LIMIT,
  API_KEY_MAX_LIFETIME_DAYS,
  API_KEY_MAX_PER_USER,
  API_KEY_MAX_RATE_LIMIT,
  API_KEY_SCOPES,
} from '../api-key-scopes';

/** What the API returns about a key: never the hash, only a display prefix. */
export interface ApiKeyView {
  id: string;
  name: string;
  keyPrefix: string | null;
  scopes: string[];
  rateLimit: number;
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export function toApiKeyView(key: ApiKeyEntity): ApiKeyView {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix ?? null,
    scopes: key.scopes ?? [],
    rateLimit: key.rateLimit,
    isActive: key.isActive,
    lastUsedAt: key.lastUsedAt ?? null,
    expiresAt: key.expiresAt ?? null,
    createdAt: key.createdAt,
  };
}

/** `lastUsedAt` is refreshed at most this often, so reads do not write on every request. */
const LAST_USED_REFRESH_MS = 60_000;

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeyRepo: Repository<ApiKeyEntity>,
  ) {}

  private generateApiKey(): string {
    const bytes = randomBytes(32).toString('hex');
    return `nxf_${bytes}`;
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  async createApiKey(
    userId: string,
    data: { name: string; scopes?: string[]; rateLimit?: number; expiresAt?: string },
  ): Promise<{ apiKey: ApiKeyEntity; plainKey: string }> {
    const existing = await this.apiKeyRepo.findOne({
      where: { userId, name: data.name, isActive: true },
    });

    if (existing) {
      throw new ConflictException('API key with this name already exists');
    }

    const scopes = data.scopes ?? [];
    const unknown = scopes.filter((scope) => !(API_KEY_SCOPES as string[]).includes(scope));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown API key scopes: ${unknown.join(', ')}`);
    }

    const rateLimit = Math.min(data.rateLimit ?? API_KEY_DEFAULT_RATE_LIMIT, API_KEY_MAX_RATE_LIMIT);

    let expiresAt: Date | undefined;
    if (data.expiresAt) {
      expiresAt = new Date(data.expiresAt);
      const maxExpiry = Date.now() + API_KEY_MAX_LIFETIME_DAYS * 86_400_000;
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('expiresAt must be in the future');
      }
      if (expiresAt.getTime() > maxExpiry) {
        throw new BadRequestException(`expiresAt may be at most ${API_KEY_MAX_LIFETIME_DAYS} days away`);
      }
    }

    const activeCount = await this.apiKeyRepo.count({ where: { userId, isActive: true } });
    if (activeCount >= API_KEY_MAX_PER_USER) {
      throw new BadRequestException(`At most ${API_KEY_MAX_PER_USER} active API keys are allowed`);
    }

    const plainKey = this.generateApiKey();
    const keyHash = this.hashKey(plainKey);

    const apiKey = this.apiKeyRepo.create({
      userId,
      name: data.name,
      keyHash,
      keyPrefix: plainKey.slice(0, 12),
      scopes,
      rateLimit,
      isActive: true,
      expiresAt,
    });

    const saved = await this.apiKeyRepo.save(apiKey);
    return { apiKey: saved, plainKey };
  }

  async getApiKeysByUser(userId: string): Promise<ApiKeyEntity[]> {
    return this.apiKeyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async revokeApiKey(id: string, userId: string): Promise<ApiKeyEntity> {
    const apiKey = await this.apiKeyRepo.findOne({
      where: { id, userId },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    apiKey.isActive = false;
    return this.apiKeyRepo.save(apiKey);
  }

  async validateApiKey(key: string): Promise<ApiKeyEntity> {
    const keyHash = this.hashKey(key);

    const apiKey = await this.apiKeyRepo.findOne({
      where: { keyHash, isActive: true },
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      throw new UnauthorizedException('API key has expired');
    }

    // Throttled, column-only write: a full save() on every request is wasteful
    // and could clobber a concurrent revoke.
    const now = new Date();
    if (!apiKey.lastUsedAt || now.getTime() - apiKey.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
      apiKey.lastUsedAt = now;
      await this.apiKeyRepo.update(apiKey.id, { lastUsedAt: now });
    }

    return apiKey;
  }
}
