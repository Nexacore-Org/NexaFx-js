import { Inject, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import {
  EndpointRateLimitConfigEntity,
  HttpMethod,
} from '../entities/endpoint-rate-limit-config.entity';
import {
  CreateEndpointRateLimitDto,
  UpdateEndpointRateLimitDto,
} from '../dto/endpoint-rate-limit.dto';

export const ENDPOINT_RATE_LIMIT_REDIS = 'ENDPOINT_RATE_LIMIT_REDIS';

/**
 * Atomic sliding-window check against a Redis sorted set.
 * KEYS[1] = bucket key; ARGV = now, windowMs, maxRequests, unique member.
 * Returns {allowed (1/0), remaining, oldestTimestampInWindow}.
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local maxRequests = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)
if count >= maxRequests then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, 0, tonumber(oldest[2])}
end
redis.call('ZADD', key, now, ARGV[4])
redis.call('PEXPIRE', key, windowMs)
return {1, maxRequests - count - 1, 0}
`;

/**
 * Rate-limit key strategy: each bucket is scoped by `method:endpoint:clientId`.
 * `clientId` is the authenticated user id when the request carries one
 * (`user:<sub>`), otherwise the caller's IP (`ip:<address>`), so one client's
 * burst never consumes another client's allowance. Counters live in Redis so
 * limits hold across app instances. New endpoints should pass the same
 * `clientId` shape (see EndpointRateLimitGuard).
 */
@Injectable()
export class EndpointRateLimitService {
  private readonly logger = new Logger(EndpointRateLimitService.name);

  constructor(
    @InjectRepository(EndpointRateLimitConfigEntity)
    private readonly configRepo: Repository<EndpointRateLimitConfigEntity>,
    @Inject(ENDPOINT_RATE_LIMIT_REDIS)
    private readonly redis: Redis,
  ) {}

  async checkRateLimit(
    endpoint: string,
    method: string,
    clientId = 'anonymous',
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
    const config = await this.configRepo.findOne({
      where: { endpoint, method: method.toUpperCase() as HttpMethod, isActive: true },
    });

    if (!config) {
      return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
    }

    const key = `endpoint-rate-limit:${method.toUpperCase()}:${endpoint}:${clientId}`;
    const now = Date.now();

    const [allowed, remaining, oldest] = (await this.redis.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      key,
      now,
      config.windowMs,
      config.maxRequests,
      `${now}:${randomUUID()}`,
    )) as [number, number, number];

    if (!allowed) {
      const retryAfterMs = oldest + config.windowMs - now;
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 1) };
    }

    return { allowed: true, remaining, retryAfterMs: 0 };
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
