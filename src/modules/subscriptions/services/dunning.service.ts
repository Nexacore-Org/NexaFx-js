import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Subscription, SubscriptionStatus } from '../entities/subscription.entity';

export type DunningStep = 'FAILURE_NOTICE' | 'REMINDER' | 'FINAL_WARNING' | 'SUSPENDED';

export interface DunningRecord {
  subscriptionId: string;
  step: DunningStep;
  scheduledAt: Date;
  sentAt?: Date;
}

const DUNNING_SCHEDULE_DAYS: Record<DunningStep, number> = {
  FAILURE_NOTICE: 1,
  REMINDER: 3,
  FINAL_WARNING: 7,
  SUSPENDED: 10,
};

@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);
  private readonly dunningLog = new Map<string, DunningRecord[]>();

  constructor(
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
  ) {}

  async initiateDunning(subscriptionId: string): Promise<DunningRecord[]> {
    const now = new Date();
    const records: DunningRecord[] = (Object.keys(DUNNING_SCHEDULE_DAYS) as DunningStep[]).map(
      (step) => {
        const scheduledAt = new Date(now);
        scheduledAt.setDate(scheduledAt.getDate() + DUNNING_SCHEDULE_DAYS[step]);
        return { subscriptionId, step, scheduledAt };
      },
    );

    this.dunningLog.set(subscriptionId, records);
    this.logger.log(`Dunning sequence initiated for subscription ${subscriptionId}`);
    return records;
  }

  async processDueDunning(): Promise<void> {
    const now = new Date();

    for (const [subscriptionId, records] of this.dunningLog.entries()) {
      for (const record of records) {
        if (record.sentAt || record.scheduledAt > now) continue;

        await this.sendDunningEmail(subscriptionId, record.step);
        record.sentAt = new Date();

        if (record.step === 'SUSPENDED') {
          await this.subRepo.update(subscriptionId, {
            status: SubscriptionStatus.SUSPENDED,
          });
          this.logger.warn(`Subscription ${subscriptionId} suspended after dunning`);
        }
      }
    }
  }

  private async sendDunningEmail(subscriptionId: string, step: DunningStep): Promise<void> {
    this.logger.log(`[Dunning] Sending ${step} email for subscription ${subscriptionId}`);
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.subRepo.update(subscriptionId, {
      status: SubscriptionStatus.CANCELLING,
    });
    this.logger.log(`Subscription ${subscriptionId} moved to CANCELLING state`);
  }

  getDunningLog(subscriptionId: string): DunningRecord[] {
    return this.dunningLog.get(subscriptionId) ?? [];
  }
}
