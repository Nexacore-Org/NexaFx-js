import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { Subscription } from '../entities/subscription.entity';
import { UsageTrackerService } from '../services/usage-tracker.service';

@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionController {
  constructor(
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    private readonly usageTracker: UsageTrackerService,
  ) {}

  /**
   * GET /subscriptions/:id/usage
   * Returns current usage vs plan limits with percentage.
   */
  @Get(':id/usage')
  async getUsage(@Param('id') id: string, @Req() req: any) {
    const sub = await this.subRepo.findOne({
      where: { id, userId: req.user.id },
      relations: ['plan'],
    });

    if (!sub) return { error: 'Subscription not found' };

    const usage = this.usageTracker.getUsage(sub.userId);
    const limits = sub.plan?.usageLimits ?? {};

    const breakdown = Object.entries(limits).map(([limitType, limit]) => {
      const current = usage[limitType] ?? 0;
      return {
        limitType,
        current,
        limit,
        percentage: limit > 0 ? Math.round((current / limit) * 100) : 0,
      };
    });

    return { subscriptionId: id, breakdown };
  }
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/subscriptions')
export class SubscriptionAdminController {
  constructor(private readonly usageTracker: UsageTrackerService) {}

  /**
   * GET /admin/subscriptions/usage-analytics
   * Top heavy users, avg usage per tier, overage revenue.
   */
  @Get('usage-analytics')
  getUsageAnalytics() {
    return this.usageTracker.getUsageAnalytics();
  }
}
