import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ApiKey, ApiKeyScope, ApiKeyStatus } from '../entities/api-key.entity';
import { ApiKeyUsageLog } from '../entities/api-key-usage-log.entity';
import { CreateApiKeyDto } from '../dto/create-api-key.dto';

const ROTATION_GRACE_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly repo: Repository<ApiKey>,
    @InjectRepository(ApiKeyUsageLog)
    private readonly usageRepo: Repository<ApiKeyUsageLog>,
  ) {}

  /** Generate a new API key. Returns the plaintext key once — never stored. */
  async create(dto: CreateApiKeyDto, createdBy: string): Promise<{ apiKey: ApiKey; plaintext: string }> {
    const rawKey = crypto.randomBytes(32).toString('hex'); // 64-char hex
    const prefix = rawKey.substring(0, 8);
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = this.repo.create({
      name: dto.name,
      prefix,
      hashedKey,
      scopes: dto.scopes,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      createdBy,
    });

    const saved = await this.repo.save(apiKey);
    return { apiKey: saved, plaintext: rawKey };
  }

  /** Validate an API key from the X-API-Key header. Returns the key entity if valid. */
  async validate(rawKey: string, requiredScope?: ApiKeyScope): Promise<ApiKey> {
    if (!rawKey || rawKey.length < 8) {
      throw new UnauthorizedException('Invalid API key format');
    }

    const prefix = rawKey.substring(0, 8);
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');

    const candidates = await this.repo.find({ where: { prefix } });
    const apiKey = candidates.find((k) => k.hashedKey === hashedKey);

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (apiKey.status === ApiKeyStatus.REVOKED) {
      throw new UnauthorizedException('API key has been revoked');
    }

    if (apiKey.status === ApiKeyStatus.EXPIRED || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
      throw new UnauthorizedException(`API key expired at ${apiKey.expiresAt?.toISOString()}`);
    }

    // Allow rotated keys during grace period
    if (apiKey.rotatedAt) {
      const gracePeriodEnd = new Date(apiKey.rotatedAt.getTime() + ROTATION_GRACE_MS);
      if (new Date() > gracePeriodEnd) {
        throw new UnauthorizedException('Rotated API key grace period has expired');
      }
    }

    if (requiredScope && !apiKey.scopes.includes(requiredScope)) {
      throw new UnauthorizedException(`API key lacks required scope: ${requiredScope}`);
    }

    // Update lastUsedAt asynchronously
    this.repo.update(apiKey.id, { lastUsedAt: new Date() }).catch(() => null);

    return apiKey;
  }

  async findAll(): Promise<ApiKey[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<ApiKey> {
    const key = await this.repo.findOne({ where: { id } });
    if (!key) throw new NotFoundException(`API key '${id}' not found`);
    return key;
  }

  async revoke(id: string): Promise<ApiKey> {
    const key = await this.findOne(id);
    key.status = ApiKeyStatus.REVOKED;
    return this.repo.save(key);
  }

  /** Rotate: generate new key, mark old key as rotated (5-min grace period). */
  async rotate(id: string, createdBy: string): Promise<{ apiKey: ApiKey; plaintext: string }> {
    const old = await this.findOne(id);
    if (old.status === ApiKeyStatus.REVOKED) {
      throw new BadRequestException('Cannot rotate a revoked key');
    }

    const { apiKey: newKey, plaintext } = await this.create(
      { name: `${old.name} (rotated)`, scopes: old.scopes, expiresAt: old.expiresAt?.toISOString() },
      createdBy,
    );

    // Mark old key as rotated
    old.rotatedAt = new Date();
    old.rotatedToId = newKey.id;
    await this.repo.save(old);

    return { apiKey: newKey, plaintext };
  }

  async logUsage(dto: {
    apiKeyId: string;
    endpoint: string;
    method: string;
    responseStatus?: number;
    latencyMs?: number;
    ipAddress?: string;
  }): Promise<void> {
    const log = this.usageRepo.create(dto);
    await this.usageRepo.save(log).catch(() => null);
  }

  async getUsageLogs(apiKeyId: string): Promise<ApiKeyUsageLog[]> {
    return this.usageRepo.find({
      where: { apiKeyId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}
