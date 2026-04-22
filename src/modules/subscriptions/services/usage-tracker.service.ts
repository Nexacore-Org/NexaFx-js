import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Subscription } from '../entities/subscription.entity';

/** In-memory usage counters per user per billing period. Replace with Redis for multi-instance. */
interface UsageEntry {
  [limitType: string]: number;
}

@Injectable()
export class UsageTrackerService {
  private readonly logger = new Logger(UsageTrackerService.name);
  /** userId -> limitType -> count */
  private readonly counters = new Map<string, UsageEntry>();

  constructor(
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
  ) {}

  /** Increment usage counter for a user and limit type */
  increment(userId: string, limitType: string, amount = 1): void {
    if (!this.counters.has(userId)) this.counters.set(userId, {});
    const entry = this.counters.get(userId)!;
    entry[limitType] = (entry[limitType] ?? 0) + amount;
  }

  /** Get current usage for a user */
  getUsage(userId: string): UsageEntry {
    return this.counters.get(userId) ?? {};
  }

  /** Get usage for a specific limit type */
  getUsageForType(userId: string, limitType: string): number {
    return this.counters.get(userId)?.[limitType] ?? 0;
  }

  /** Reset counters for a user (called at billing period start) */
  resetUsage(userId: string): void {
    this.counters.delete(userId);
  }

  /** Sync in-memory counters to DB every hour for billing accuracy */
  @Cron(CronExpression.EVERY_HOUR)
  async syncToDb(): Promise<void> {
    this.logger.log(`Syncing ${this.counters.size} usage entries to DB`);
    // TODO: persist counters to a usage_records table for billing accuracy
    // For now, log the sync
    for (const [userId, usage] of this.counters.entries()) {
      this.logger.debug(`Usage for ${userId}: ${JSON.stringify(usage)}`);
    }
  }

  /** Get usage analytics for admin */
  async getUsageAnalytics(): Promise<{
    topHeavyUsers: { userId: string; totalUsage: number }[];
    avgUsagePerTier: Record<string, number>;
    overageRevenue: number;
  }> {
    // Compute top heavy users from in-memory counters
    const userTotals = Array.from(this.counters.entries()).map(([userId, usage]) => ({
      userId,
      totalUsage: Object.values(usage).reduce((sum, v) => sum + v, 0),
    }));
    userTotals.sort((a, b) => b.totalUsage - a.totalUsage);
    const topHeavyUsers = userTotals.slice(0, 10);

    // Compute overage revenue from subscriptions
    const subs = await this.subRepo.find({ relations: ['plan'] });
    let overageRevenue = 0;
    const tierUsage: Record<string, number[]> = {};

    for (const sub of subs) {
      if (!sub.plan) continue;
      const usage = this.getUsage(sub.userId);
      const tierName = sub.plan.name;
      if (!tierUsage[tierName]) tierUsage[tierName] = [];

      let userTotal = 0;
      for (const [limitType, limit] of Object.entries(sub.plan.usageLimits ?? {})) {
        const used = usage[limitType] ?? 0;
        userTotal += used;
        const overage = Math.max(0, used - limit);
        const fee = (sub.plan.overageFees?.[limitType] ?? 0) * overage;
        overageRevenue += fee;
      }
      tierUsage[tierName].push(userTotal);
    }

    const avgUsagePerTier: Record<string, number> = {};
    for (const [tier, usages] of Object.entries(tierUsage)) {
      avgUsagePerTier[tier] = usages.length > 0
        ? usages.reduce((s, v) => s + v, 0) / usages.length
        : 0;
    }

    return { topHeavyUsers, avgUsagePerTier, overageRevenue };
  }
}
