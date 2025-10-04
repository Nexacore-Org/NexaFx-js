// src/security/services/ip-block.service.ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';

export interface BlockedIP {
  ip: string;
  reason: string;
  blockedAt: Date;
  expiresAt?: Date;
  isAutomatic: boolean;
}

export interface IPWhitelist {
  ip: string;
  description: string;
  addedAt: Date;
}

@Injectable()
export class IpBlockService {
  private readonly logger = new Logger(IpBlockService.name);
  private readonly BLOCKED_IP_PREFIX = 'blocked_ip:';
  private readonly WHITELIST_PREFIX = 'whitelist_ip:';
  private readonly BLOCK_ATTEMPTS_PREFIX = 'block_attempts:';
  private readonly BLOCKED_IPS_SET = 'blocked_ips_set';
  private readonly WHITELIST_SET = 'whitelist_ips_set';

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {
    this.redis.on('error', (err) => {
      this.logger.error('Redis error in IpBlockService:', err);
    });
  }

  async isBlocked(ip: string): Promise<boolean> {
    try {
      // Check if IP is whitelisted first
      const isWhitelisted = await this.isWhitelisted(ip);
      if (isWhitelisted) {
        return false;
      }

      const blocked = await this.redis.get(`${this.BLOCKED_IP_PREFIX}${ip}`);
      return !!blocked;
    } catch (err) {
      this.logger.error(`Error checking if IP ${ip} is blocked:`, err);
      return false;
    }
  }

  async isWhitelisted(ip: string): Promise<boolean> {
    try {
      const whitelisted = await this.redis.sismember(this.WHITELIST_SET, ip);
      return whitelisted === 1;
    } catch (err) {
      this.logger.error(`Error checking if IP ${ip} is whitelisted:`, err);
      return false;
    }
  }

  async blockIP(
    ip: string,
    reason: string,
    ttl?: number,
    isAutomatic: boolean = false,
  ): Promise<void> {
    try {
      const blockData: BlockedIP = {
        ip,
        reason,
        blockedAt: new Date(),
        expiresAt: ttl ? new Date(Date.now() + ttl * 1000) : undefined,
        isAutomatic,
      };

      const key = `${this.BLOCKED_IP_PREFIX}${ip}`;
      await this.redis.set(key, JSON.stringify(blockData));

      if (ttl) {
        await this.redis.expire(key, ttl);
      }

      await this.redis.sadd(this.BLOCKED_IPS_SET, ip);

      this.logger.warn(`IP ${ip} blocked. Reason: ${reason}`);
    } catch (err) {
      this.logger.error(`Error blocking IP ${ip}:`, err);
      throw err;
    }
  }

  async unblockIP(ip: string): Promise<void> {
    try {
      await this.redis.del(`${this.BLOCKED_IP_PREFIX}${ip}`);
      await this.redis.srem(this.BLOCKED_IPS_SET, ip);
      await this.redis.del(`${this.BLOCK_ATTEMPTS_PREFIX}${ip}`);

      this.logger.log(`IP ${ip} unblocked`);
    } catch (err) {
      this.logger.error(`Error unblocking IP ${ip}:`, err);
      throw err;
    }
  }

  async whitelistIP(ip: string, description: string): Promise<void> {
    try {
      const whitelistData: IPWhitelist = {
        ip,
        description,
        addedAt: new Date(),
      };

      await this.redis.set(
        `${this.WHITELIST_PREFIX}${ip}`,
        JSON.stringify(whitelistData),
      );
      await this.redis.sadd(this.WHITELIST_SET, ip);

      // Remove from blocked list if present
      await this.unblockIP(ip);

      this.logger.log(`IP ${ip} added to whitelist`);
    } catch (err) {
      this.logger.error(`Error whitelisting IP ${ip}:`, err);
      throw err;
    }
  }

  async removeFromWhitelist(ip: string): Promise<void> {
    try {
      await this.redis.del(`${this.WHITELIST_PREFIX}${ip}`);
      await this.redis.srem(this.WHITELIST_SET, ip);

      this.logger.log(`IP ${ip} removed from whitelist`);
    } catch (err) {
      this.logger.error(`Error removing IP ${ip} from whitelist:`, err);
      throw err;
    }
  }

  async getBlockedIPs(): Promise<BlockedIP[]> {
    try {
      const ips = await this.redis.smembers(this.BLOCKED_IPS_SET);
      const blockedIPs: BlockedIP[] = [];

      for (const ip of ips) {
        const data = await this.redis.get(`${this.BLOCKED_IP_PREFIX}${ip}`);
        if (data) {
          blockedIPs.push(JSON.parse(data));
        }
      }

      return blockedIPs;
    } catch (err) {
      this.logger.error('Error getting blocked IPs:', err);
      return [];
    }
  }

  async getWhitelistedIPs(): Promise<IPWhitelist[]> {
    try {
      const ips = await this.redis.smembers(this.WHITELIST_SET);
      const whitelistedIPs: IPWhitelist[] = [];

      for (const ip of ips) {
        const data = await this.redis.get(`${this.WHITELIST_PREFIX}${ip}`);
        if (data) {
          whitelistedIPs.push(JSON.parse(data));
        }
      }

      return whitelistedIPs;
    } catch (err) {
      this.logger.error('Error getting whitelisted IPs:', err);
      return [];
    }
  }

  async getBlockedIPDetails(ip: string): Promise<BlockedIP | null> {
    try {
      const data = await this.redis.get(`${this.BLOCKED_IP_PREFIX}${ip}`);
      return data ? (JSON.parse(data) as BlockedIP) : null;
    } catch (err) {
      this.logger.error(`Error getting blocked IP details for ${ip}:`, err);
      return null;
    }
  }

  async recordFailedAttempt(
    ip: string,
    threshold: number = 5,
    window: number = 900,
  ): Promise<boolean> {
    try {
      const key = `${this.BLOCK_ATTEMPTS_PREFIX}${ip}`;
      const attempts = await this.redis.incr(key);

      if (attempts === 1) {
        await this.redis.expire(key, window);
      }

      if (attempts >= threshold) {
        await this.blockIP(
          ip,
          `Automatic block: ${attempts} failed attempts`,
          3600,
          true,
        );
        return true;
      }

      return false;
    } catch (err) {
      this.logger.error(`Error recording failed attempt for IP ${ip}:`, err);
      return false;
    }
  }

  async getFailedAttempts(ip: string): Promise<number> {
    try {
      const attempts = await this.redis.get(
        `${this.BLOCK_ATTEMPTS_PREFIX}${ip}`,
      );
      return attempts ? parseInt(attempts, 10) : 0;
    } catch (err) {
      this.logger.error(`Error getting failed attempts for IP ${ip}:`, err);
      return 0;
    }
  }
}
