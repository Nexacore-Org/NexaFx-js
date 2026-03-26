import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { FeatureFlagEntity, TargetingRule } from '../entities/feature-flag.entity';

interface UserContext {
  userId: string;
  role?: string;
  country?: string;
}

interface EvaluationResult {
  enabled: boolean;
  reason: string;
}

interface EvaluationStats {
  flagId: string;
  flagName: string;
  totalEvaluations: number;
  enabledCount: number;
  enabledPercentage: number;
}

@Injectable()
export class FeatureFlagEvaluationService {
  private readonly logger = new Logger(FeatureFlagEvaluationService.name);

  /** Per-user-per-flag evaluation cache: `${flagName}:${userId}` → { result, expiresAt } */
  private readonly evalCache = new Map<
    string,
    { result: boolean; expiresAt: number }
  >();
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

  /** In-memory analytics counters: flagId → { total, enabled } */
  private readonly evaluationCounters = new Map<
    string,
    { total: number; enabled: number }
  >();

  constructor(
    @InjectRepository(FeatureFlagEntity)
    private readonly repository: Repository<FeatureFlagEntity>,
  ) {}

  /**
   * Evaluate a feature flag for a given user context.
   * Result is cached per user per flag for 30 seconds.
   */
  async evaluate(flagName: string, user: UserContext): Promise<boolean> {
    const cacheKey = `${flagName}:${user.userId}`;
    const cached = this.evalCache.get(cacheKey);

    if (cached && Date.now() < cached.expiresAt) {
      return cached.result;
    }

    const flag = await this.repository.findOne({ where: { name: flagName } });
    if (!flag) {
      return false;
    }

    const result = this.evaluateFlag(flag, user);

    this.evalCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    this.recordEvaluation(flag.id, result);
    return result;
  }

  /**
   * Invalidate cached evaluations for a flag (called on flag update).
   */
  invalidateCacheForFlag(flagName: string): void {
    for (const key of this.evalCache.keys()) {
      if (key.startsWith(`${flagName}:`)) {
        this.evalCache.delete(key);
      }
    }
  }

  /**
   * Get analytics for a flag: total evaluations and % of users who got enabled=true.
   */
  async getAnalytics(flagId: string): Promise<EvaluationStats> {
    const flag = await this.repository.findOne({ where: { id: flagId } });
    if (!flag) {
      return { flagId, flagName: 'unknown', totalEvaluations: 0, enabledCount: 0, enabledPercentage: 0 };
    }

    const counters = this.evaluationCounters.get(flagId) ?? { total: 0, enabled: 0 };
    const enabledPercentage =
      counters.total > 0
        ? Math.round((counters.enabled / counters.total) * 100)
        : 0;

    return {
      flagId,
      flagName: flag.name,
      totalEvaluations: counters.total,
      enabledCount: counters.enabled,
      enabledPercentage,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private evaluateFlag(flag: FeatureFlagEntity, user: UserContext): boolean {
    if (!flag.enabled) {
      return false;
    }

    if (!flag.targetingRules || flag.targetingRules.length === 0) {
      return true;
    }

    for (const rule of flag.targetingRules) {
      if (!this.matchesRule(rule, flag.name, user)) {
        return false;
      }
    }

    return true;
  }

  private matchesRule(rule: TargetingRule, flagName: string, user: UserContext): boolean {
    switch (rule.type) {
      case 'role':
        return user.role === rule.value;

      case 'country':
        return user.country === rule.value;

      case 'userId':
        return user.userId === rule.value;

      case 'percentage': {
        const percentage = typeof rule.value === 'number' ? rule.value : parseInt(String(rule.value), 10);
        const bucket = this.hashBucket(user.userId, flagName);
        return bucket < percentage;
      }

      default:
        this.logger.warn(`Unknown targeting rule type: ${(rule as any).type}`);
        return false;
    }
  }

  /**
   * Deterministic hash-based bucket assignment.
   * Same userId + flagName always resolves to the same 0-99 bucket.
   */
  private hashBucket(userId: string, flagName: string): number {
    const hash = crypto
      .createHash('sha256')
      .update(`${userId}${flagName}`)
      .digest('hex');
    return parseInt(hash.substring(0, 8), 16) % 100;
  }

  private recordEvaluation(flagId: string, result: boolean): void {
    const current = this.evaluationCounters.get(flagId) ?? { total: 0, enabled: 0 };
    current.total += 1;
    if (result) current.enabled += 1;
    this.evaluationCounters.set(flagId, current);
  }
}
