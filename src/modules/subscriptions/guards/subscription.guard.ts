import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../entities/subscription.entity';
import { UsageTrackerService } from '../services/usage-tracker.service';

export const LIMIT_TYPE_KEY = 'limitType';
export const LimitType = (limitType: string) =>
  (target: any, key: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(LIMIT_TYPE_KEY, limitType, descriptor.value);
    return descriptor;
  };

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    private readonly usageTracker: UsageTrackerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limitType = this.reflector.get<string>(LIMIT_TYPE_KEY, context.getHandler());
    if (!limitType) return true; // No limit configured for this route

    const request = context.switchToHttp().getRequest();
    const userId: string = request.user?.id ?? request.user?.sub;
    if (!userId) return true;

    const sub = await this.subRepo.findOne({
      where: { userId },
      relations: ['plan'],
    });

    if (!sub?.plan) return true; // No subscription — allow

    const planLimit = sub.plan.usageLimits?.[limitType];
    if (planLimit === undefined) return true; // No limit for this type

    const currentUsage = this.usageTracker.getUsageForType(userId, limitType);

    if (currentUsage >= planLimit) {
      throw new HttpException(
        {
          limitType,
          currentUsage,
          planLimit,
          upgradeUrl: '/subscriptions/upgrade',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment usage after passing the check
    this.usageTracker.increment(userId, limitType);
    return true;
  }
}
