import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { Subscription } from './entities/subscription.entity';
import { Invoice } from './entities/invoice.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';

import { BillingService } from './services/billing.service';
import { UsageTrackerService } from './services/usage-tracker.service';

import { BillingCronJob } from './jobs/billing-job.cron';
import { SubscriptionGuard } from './guards/subscription.guard';
import { SubscriptionController, SubscriptionAdminController } from './controllers/subscription.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, Invoice, SubscriptionPlan]),
    ScheduleModule.forRoot(),
  ],
  controllers: [SubscriptionController, SubscriptionAdminController],
  providers: [BillingService, UsageTrackerService, BillingCronJob, SubscriptionGuard],
  exports: [BillingService, UsageTrackerService, SubscriptionGuard],
})
export class SubscriptionsModule {}
