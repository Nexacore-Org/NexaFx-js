import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ApiKeyEntity } from '../entities/api-key.entity';

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

    const plainKey = this.generateApiKey();
    const keyHash = this.hashKey(plainKey);

    const apiKey = this.apiKeyRepo.create({
      userId,
      name: data.name,
      keyHash,
      scopes: data.scopes || [],
      rateLimit: data.rateLimit || 1000,
      isActive: true,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
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

    apiKey.lastUsedAt = new Date();
    await this.apiKeyRepo.save(apiKey);

    return apiKey;
  }
}
