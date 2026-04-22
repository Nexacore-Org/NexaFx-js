import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Subscription, SubscriptionStatus } from '../entities/subscription.entity';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { UsageTrackerService } from './usage-tracker.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(Subscription) private subRepo: Repository<Subscription>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    private dataSource: DataSource,
    private usageTracker: UsageTrackerService,
  ) {}

  async calculateProration(currentSub: Subscription, newPlan: SubscriptionPlan): Promise<number> {
    const now = new Date();
    const totalDays = (currentSub.currentPeriodEnd.getTime() - currentSub.currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24);
    const remainingDays = (currentSub.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    const unusedCredit = (currentSub.plan.price / totalDays) * remainingDays;
    const newPlanCost = (newPlan.price / 30) * remainingDays; // Assuming 30-day month for simplicity
    
    return Math.max(0, newPlanCost - unusedCredit);
  }

  async processBilling(subscription: Subscription) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Calculate overage charges
      const overageAmount = this.calculateOverage(subscription);
      const totalAmount = Number(subscription.plan.price) + overageAmount;

      // 1. Create Immutable Invoice
      const invoice = this.invoiceRepo.create({
        subscriptionId: subscription.id,
        userId: subscription.userId,
        amount: totalAmount,
        status: InvoiceStatus.PENDING,
      });
      await queryRunner.manager.save(invoice);

      // 2. Attempt Wallet Debit (Mocking wallet service integration)
      const success = await this.debitUserWallet(subscription.userId, totalAmount);

      if (success) {
        invoice.status = InvoiceStatus.PAID;
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.currentPeriodStart = new Date();
        subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        subscription.failedAttemptCount = 0;
        // Reset usage counters for new billing period
        this.usageTracker.resetUsage(subscription.userId);
      } else {
        await this.handleFailedPayment(subscription, invoice);
      }

      await queryRunner.manager.save(invoice);
      await queryRunner.manager.save(subscription);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Billing failed for ${subscription.id}`, err.stack);
    } finally {
      await queryRunner.release();
    }
  }

  /** Calculate overage charges based on current usage vs plan limits */
  calculateOverage(subscription: Subscription): number {
    if (!subscription.plan?.usageLimits || !subscription.plan?.overageFees) return 0;

    const usage = this.usageTracker.getUsage(subscription.userId);
    let total = 0;

    for (const [limitType, limit] of Object.entries(subscription.plan.usageLimits)) {
      const used = usage[limitType] ?? 0;
      const overage = Math.max(0, used - limit);
      const fee = (subscription.plan.overageFees[limitType] ?? 0) * overage;
      total += fee;
    }

    return total;
  }

  private async handleFailedPayment(sub: Subscription, invoice: Invoice) {
    sub.failedAttemptCount++;
    sub.status = SubscriptionStatus.PAST_DUE;
    invoice.status = InvoiceStatus.FAILED;

    if (sub.failedAttemptCount >= 3) { // Day 7 dunning logic
      sub.status = SubscriptionStatus.SUSPENDED;
      this.logger.warn(`Subscription ${sub.id} suspended after 3 failed attempts.`);
    }
  }

  private async debitUserWallet(userId: string, amount: number): Promise<boolean> {
    // Integration point for NexaFx wallet service
    return true; 
  }
}