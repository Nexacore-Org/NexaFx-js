import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EndpointRateLimitConfigEntity,
  HttpMethod,
} from '../entities/endpoint-rate-limit-config.entity';
import {
  CreateEndpointRateLimitDto,
  UpdateEndpointRateLimitDto,
} from '../dto/endpoint-rate-limit.dto';

interface SlidingWindowEntry {
  timestamps: number[];
}

@Injectable()
export class EndpointRateLimitService {
  private readonly logger = new Logger(EndpointRateLimitService.name);
  private readonly slidingWindows = new Map<string, SlidingWindowEntry>();

  constructor(
    @InjectRepository(EndpointRateLimitConfigEntity)
    private readonly configRepo: Repository<EndpointRateLimitConfigEntity>,
  ) {}

  async checkRateLimit(
    endpoint: string,
    method: string,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
    const config = await this.configRepo.findOne({
      where: { endpoint, method: method.toUpperCase() as HttpMethod, isActive: true },
    });

    if (!config) {
      return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
    }

    const key = `${method.toUpperCase()}:${endpoint}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    let entry = this.slidingWindows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.slidingWindows.set(key, entry);
    }

    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    if (entry.timestamps.length >= config.maxRequests) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = oldestInWindow + config.windowMs - now;
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 1) };
    }

    entry.timestamps.push(now);
    return {
      allowed: true,
      remaining: config.maxRequests - entry.timestamps.length,
      retryAfterMs: 0,
    };
  }

  async listConfigs(): Promise<EndpointRateLimitConfigEntity[]> {
    return this.configRepo.find({ order: { createdAt: 'DESC' } });
  }

  async createConfig(
    dto: CreateEndpointRateLimitDto,
  ): Promise<EndpointRateLimitConfigEntity> {
    const config = this.configRepo.create({
      endpoint: dto.endpoint,
      method: dto.method.toUpperCase() as HttpMethod,
      maxRequests: dto.maxRequests,
      windowMs: dto.windowMs,
      isActive: dto.isActive ?? true,
    });
    return this.configRepo.save(config);
  }

  async updateConfig(
    id: string,
    dto: UpdateEndpointRateLimitDto,
  ): Promise<EndpointRateLimitConfigEntity> {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`Rate limit config with ID ${id} not found`);
    }

    if (dto.endpoint !== undefined) config.endpoint = dto.endpoint;
    if (dto.method !== undefined) config.method = dto.method.toUpperCase() as HttpMethod;
    if (dto.maxRequests !== undefined) config.maxRequests = dto.maxRequests;
    if (dto.windowMs !== undefined) config.windowMs = dto.windowMs;
    if (dto.isActive !== undefined) config.isActive = dto.isActive;

    return this.configRepo.save(config);
  }

  async getDefaultConfigs(): Promise<CreateEndpointRateLimitDto[]> {
    return [
      { endpoint: '/api/v1/auth/login', method: 'POST', maxRequests: 5, windowMs: 60000 },
      { endpoint: '/api/v1/auth/register', method: 'POST', maxRequests: 3, windowMs: 300000 },
      { endpoint: '/api/v1/transactions', method: 'POST', maxRequests: 10, windowMs: 60000 },
      { endpoint: '/api/v1/transactions', method: 'GET', maxRequests: 100, windowMs: 60000 },
      { endpoint: '/api/v1/wallets', method: 'GET', maxRequests: 100, windowMs: 60000 },
      { endpoint: '/api/v1/webhooks', method: 'POST', maxRequests: 20, windowMs: 60000 },
    ];
  }
}
