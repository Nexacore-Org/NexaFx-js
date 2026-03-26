import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingService } from '../services/billing.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull, Not } from 'typeorm';
import { Subscription, SubscriptionStatus } from '../entities/subscription.entity';

@Injectable()
export class BillingCronJob {
  private readonly logger = new Logger(BillingCronJob.name);

  constructor(
    private billingService: BillingService,
    @InjectRepository(Subscription) private subRepo: Repository<Subscription>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDailyBilling() {
    this.logger.log('Starting daily billing cycle...');

    const now = new Date();

    // 1. Process regular renewals
    const dueSubscriptions = await this.subRepo.find({
      where: {
        status: Not(SubscriptionStatus.SUSPENDED),
        currentPeriodEnd: LessThanOrEqual(now),
      },
      relations: ['plan'],
    });

    // 2. Process Trial expirations
    const expiringTrials = await this.subRepo.find({
      where: {
        status: SubscriptionStatus.TRIALING,
        trialEnd: LessThanOrEqual(now),
      },
      relations: ['plan'],
    });

    const allToCharge = [...dueSubscriptions, ...expiringTrials];

    for (const sub of allToCharge) {
      await this.billingService.processBilling(sub);
    }

    this.logger.log(`Billing cycle complete. Processed ${allToCharge.length} items.`);
  }
}