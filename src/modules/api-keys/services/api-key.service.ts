import { Injectable, Logger, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ApiKeyEntity } from '../entities/api-key.entity';
import { ApiKeyUsageLogEntity } from '../entities/api-key-usage-log.entity';

export interface GenerateApiKeyDto {
  name: string;
  scopes: string[];
  expiresAt?: Date;
}

export interface ValidatedApiKey {
  id: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
}

const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeyRepo: Repository<ApiKeyEntity>,
    @InjectRepository(ApiKeyUsageLogEntity)
    private readonly usageLogRepo: Repository<ApiKeyUsageLogEntity>,
  ) {}

  /**
   * Generate a new API key
   * Returns the plaintext key ONCE - it cannot be retrieved later
   */
  async generateKey(dto: GenerateApiKeyDto): Promise<{ apiKey: ApiKeyEntity; rawKey: string }> {
    const { rawKey, prefix, hashedKey } = this.createKeyHash();

    const apiKey = this.apiKeyRepo.create({
      name: dto.name,
      scopes: dto.scopes,
      prefix,
      hashedKey,
      expiresAt: dto.expiresAt || null,
      isActive: true,
    });

    const saved = await this.apiKeyRepo.save(apiKey);
    this.logger.log(`API key generated: ${saved.name} (${prefix}...)`);

    return { apiKey: saved, rawKey };
  }

  /**
   * Validate an API key from the X-API-Key header
   */
  async validateKey(rawKey: string): Promise<ValidatedApiKey> {
    if (!rawKey || rawKey.length < 8) {
      throw new UnauthorizedException('Invalid API key format');
    }

    const prefix = rawKey.substring(0, 8);
    const hashedKey = createHash('sha256').update(rawKey).digest('hex');

    // Find by prefix first (indexed lookup)
    const apiKey = await this.apiKeyRepo.findOne({
      where: { prefix, hashedKey, isActive: true },
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Check if revoked
    if (apiKey.revokedAt) {
      throw new UnauthorizedException('API key has been revoked');
    }

    // Check if expired
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException(`API key expired on ${apiKey.expiresAt.toISOString()}`);
    }

    // Update last used timestamp (async, don't block)
    this.apiKeyRepo.update(apiKey.id, { lastUsedAt: new Date() }).catch(err => {
      this.logger.error(`Failed to update lastUsedAt for key ${apiKey.id}: ${err.message}`);
    });

    return {
      id: apiKey.id,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
    };
  }

  /**
   * Revoke an API key immediately
   */
  async revokeKey(id: string): Promise<ApiKeyEntity> {
    const apiKey = await this.apiKeyRepo.findOne({ where: { id } });
    if (!apiKey) {
      throw new NotFoundException(`API key ${id} not found`);
    }

    apiKey.revokedAt = new Date();
    apiKey.isActive = false;
    const saved = await this.apiKeyRepo.save(apiKey);
    
    this.logger.log(`API key revoked: ${apiKey.name} (${apiKey.prefix}...)`);
    return saved;
  }

  /**
   * Rotate an API key: generate new key, keep old key active for 5-minute grace period
   */
  async rotateKey(id: string, newName?: string): Promise<{ apiKey: ApiKeyEntity; rawKey: string }> {
    const oldKey = await this.apiKeyRepo.findOne({ where: { id } });
    if (!oldKey) {
      throw new NotFoundException(`API key ${id} not found`);
    }

    // Generate new key with same scopes
    const newKey = await this.generateKey({
      name: newName || `${oldKey.name} (rotated)`,
      scopes: oldKey.scopes,
      expiresAt: oldKey.expiresAt,
    });

    // Schedule old key revocation after 5-minute grace period
    setTimeout(async () => {
      try {
        await this.apiKeyRepo.update(oldKey.id, {
          revokedAt: new Date(),
          isActive: false,
        });
        this.logger.log(`Grace period expired - old key revoked: ${oldKey.prefix}...`);
      } catch (error) {
        this.logger.error(`Failed to revoke old key ${oldKey.id} after grace period: ${error.message}`);
      }
    }, GRACE_PERIOD_MS);

    this.logger.log(`API key rotated: ${oldKey.name} -> ${newKey.apiKey.name}`);
    return newKey;
  }

  /**
   * Log API key usage
   */
  async logUsage(
    apiKeyId: string,
    endpoint: string,
    responseStatus: number,
    latencyMs: number,
    ipAddress?: string,
  ): Promise<void> {
    const logEntry = this.usageLogRepo.create({
      apiKeyId,
      endpoint,
      responseStatus,
      latencyMs,
      ipAddress,
    });

    // Async save - don't block the response
    this.usageLogRepo.save(logEntry).catch(err => {
      this.logger.error(`Failed to log API key usage: ${err.message}`);
    });
  }

  /**
   * List all API keys (without hashed keys)
   */
  async listKeys(): Promise<Partial<ApiKeyEntity>[]> {
    const keys = await this.apiKeyRepo.find({
      order: { createdAt: 'DESC' },
    });

    // Remove sensitive data
    return keys.map(key => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      scopes: key.scopes,
      isActive: key.isActive,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }));
  }

  /**
   * Get a single API key by ID
   */
  async getKeyById(id: string): Promise<Partial<ApiKeyEntity>> {
    const key = await this.apiKeyRepo.findOne({ where: { id } });
    if (!key) {
      throw new NotFoundException(`API key ${id} not found`);
    }

    return {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      scopes: key.scopes,
      isActive: key.isActive,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    };
  }

  /**
   * Create key hash from random bytes
   */
  private createKeyHash(): { rawKey: string; prefix: string; hashedKey: string } {
    const rawKey = `nk_${randomBytes(32).toString('hex')}`;
    const prefix = rawKey.substring(0, 8);
    const hashedKey = createHash('sha256').update(rawKey).digest('hex');
    return { rawKey, prefix, hashedKey };
  }
}
