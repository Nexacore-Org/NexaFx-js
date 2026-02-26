import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import {
  RateLimitRuleEntity,
  UserTier,
  RiskLevel,
} from '../entities/rate-limit-rule.entity';
import { RateLimitTrackerEntity } from '../entities/rate-limit-tracker.entity';

export interface RateLimitContext {
  userId?: string;
  tier?: UserTier;
  riskLevel?: RiskLevel;
  ipAddress?: string;
  route: string;
  method: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
  ruleId?: string;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(
    @InjectRepository(RateLimitRuleEntity)
    private readonly ruleRepository: Repository<RateLimitRuleEntity>,
    @InjectRepository(RateLimitTrackerEntity)
    private readonly trackerRepository: Repository<RateLimitTrackerEntity>,
  ) {}

  /**
   * Check if a request should be allowed based on rate limits
   */
  async checkRateLimit(context: RateLimitContext): Promise<RateLimitResult> {
    // Determine user tier (default to guest if not provided)
    const tier = context.tier || 'guest';

    // Find applicable rate limit rules
    const rules = await this.findApplicableRules(
      tier,
      context.riskLevel,
      context.route,
      context.method,
    );

    if (rules.length === 0) {
      // No rules found, allow the request
      this.logger.warn(
        `No rate limit rules found for tier: ${tier}, route: ${context.route}`,
      );
      return {
        allowed: true,
        remaining: Number.MAX_SAFE_INTEGER,
        resetAt: new Date(Date.now() + 3600000), // 1 hour default
        limit: Number.MAX_SAFE_INTEGER,
      };
    }

    // Use the highest priority rule (first in sorted array)
    const rule = rules[0];

    // Generate tracker key
    const trackerKey = this.generateTrackerKey(context);

    // Get or create tracker
    const tracker = await this.getOrCreateTracker(
      trackerKey,
      context.userId,
      context.ipAddress,
      rule,
    );

    // Check if limit is exceeded
    const allowed = tracker.requestCount < rule.maxRequests;
    const remaining = Math.max(0, rule.maxRequests - tracker.requestCount);
    const resetAt = tracker.expiresAt;

    if (!allowed) {
      this.logger.warn(
        `Rate limit exceeded for ${trackerKey}: ${tracker.requestCount}/${rule.maxRequests} requests in window`,
      );
    }

    return {
      allowed,
      remaining,
      resetAt,
      limit: rule.maxRequests,
      ruleId: rule.id,
    };
  }

  /**
   * Increment the request count for a tracker
   */
  async incrementRequest(context: RateLimitContext): Promise<void> {
    const tier = context.tier || 'guest';
    const rules = await this.findApplicableRules(
      tier,
      context.riskLevel,
      context.route,
      context.method,
    );

    if (rules.length === 0) {
      return;
    }

    const rule = rules[0];
    const trackerKey = this.generateTrackerKey(context);

    await this.trackerRepository.update(
      {
        trackerKey,
        ruleId: rule.id,
      },
      {
        requestCount: () => 'requestCount + 1',
        updatedAt: new Date(),
      },
    );
  }

  /**
   * Find applicable rate limit rules for the given context
   */
  private async findApplicableRules(
    tier: UserTier,
    riskLevel: RiskLevel | undefined,
    route: string,
    method: string,
  ): Promise<RateLimitRuleEntity[]> {
    // Get all active rules for this tier
    const allRules = await this.ruleRepository.find({
      where: {
        isActive: true,
        tier,
      },
      order: {
        priority: 'DESC',
        createdAt: 'DESC',
      },
    });

    // Filter rules that match the context
    const applicableRules = allRules.filter((rule) => {
      // Check risk level
      if (rule.riskLevel && rule.riskLevel !== riskLevel) {
        return false;
      }

      // Check method
      if (rule.method && rule.method !== method) {
        return false;
      }

      // Check route pattern
      if (rule.routePattern) {
        if (!this.matchesRoutePattern(route, rule.routePattern)) {
          return false;
        }
      }

      return true;
    });

    return applicableRules;
  }

  /**
   * Check if a route matches a pattern (supports * wildcard)
   */
  private matchesRoutePattern(route: string, pattern: string): boolean {
    // Exact match
    if (route === pattern) {
      return true;
    }

    // Convert pattern to regex (support * wildcard)
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\//g, '\\/');
    const regex = new RegExp(`^${regexPattern}$`);

    return regex.test(route);
  }

  /**
   * Generate a unique tracker key for rate limiting
   */
  private generateTrackerKey(context: RateLimitContext): string {
    // For authenticated users, use userId
    if (context.userId) {
      return `user:${context.userId}`;
    }
    // For guest users, use IP address
    if (context.ipAddress) {
      return `ip:${context.ipAddress}`;
    }
    // Fallback to a default key
    return 'anonymous';
  }

  /**
   * Get or create a rate limit tracker
   */
  private async getOrCreateTracker(
    trackerKey: string,
    userId: string | undefined,
    ipAddress: string | undefined,
    rule: RateLimitRuleEntity,
  ): Promise<RateLimitTrackerEntity> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + rule.windowSeconds * 1000);

    // Try to find existing tracker
    let tracker = await this.trackerRepository.findOne({
      where: {
        trackerKey,
        ruleId: rule.id,
      },
    });

    if (tracker) {
      // Check if tracker has expired
      if (tracker.expiresAt < now) {
        // Reset the tracker
        tracker.requestCount = 0;
        tracker.windowStart = now;
        tracker.expiresAt = expiresAt;
        tracker.updatedAt = now;
        await this.trackerRepository.save(tracker);
      }
      return tracker;
    }

    // Create new tracker
    tracker = this.trackerRepository.create({
      trackerKey,
      userId,
      ipAddress,
      ruleId: rule.id,
      requestCount: 0,
      windowStart: now,
      expiresAt,
    });

    return await this.trackerRepository.save(tracker);
  }

  /**
   * Clean up expired trackers (should be called periodically)
   */
  async cleanupExpiredTrackers(): Promise<number> {
    const result = await this.trackerRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected || 0;
  }

  /**
   * Get current rate limit status for a user/IP
   */
  async getRateLimitStatus(
    context: RateLimitContext,
  ): Promise<RateLimitResult> {
    return this.checkRateLimit(context);
  }
}
