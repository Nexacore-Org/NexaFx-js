import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ScheduledTransactionEntity } from '../entities/scheduled-transaction.entity';
import { ScheduledTransactionService } from './scheduled-transaction.service';
import { TransactionLifecycleService } from '../../transactions/services/transaction-lifecycle.service';
import { NotificationService } from '../../notifications/services/notification.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(ScheduledTransactionEntity)
    private readonly repo: Repository<ScheduledTransactionEntity>,
    private readonly scheduledTxService: ScheduledTransactionService,
    private readonly lifecycle: TransactionLifecycleService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron('* * * * *') // every minute
  async runDueSchedules(): Promise<void> {
    const due = await this.repo.find({
      where: { status: 'ACTIVE', nextRunAt: LessThanOrEqual(new Date()) },
      take: 100,
    });
    for (const schedule of due) {
      await this.executeSchedule(schedule);
    }
  }

  private async executeSchedule(schedule: ScheduledTransactionEntity): Promise<void> {
    // Idempotency: skip if this window was already executed
    const windowKey = schedule.nextRunAt.toISOString();
    if (schedule.executionHistory?.some((h) => h.executedAt === windowKey)) return;

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const tx = await this.lifecycle.create({
          amount: schedule.amount,
          currency: schedule.currency,
          description: schedule.description ?? `Scheduled ${schedule.frequency} transaction`,
          metadata: { scheduleId: schedule.id, frequency: schedule.frequency, idempotencyKey: `sched-${schedule.id}-${windowKey}` },
        });

        schedule.consecutiveFailures = 0;
        schedule.executionHistory = [
          ...(schedule.executionHistory ?? []),
          { executedAt: windowKey, status: 'SUCCESS', transactionId: tx.id },
        ].slice(-50);
        schedule.nextRunAt = this.scheduledTxService.calcNextRun(new Date(), schedule.frequency);
        await this.repo.save(schedule);
        this.logger.log(`Schedule ${schedule.id} executed → tx ${tx.id}`);
        return;
      } catch (err: any) {
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        } else {
          schedule.consecutiveFailures += 1;
          schedule.executionHistory = [
            ...(schedule.executionHistory ?? []),
            { executedAt: windowKey, status: 'FAILED', error: err.message },
          ].slice(-50);

          if (schedule.consecutiveFailures >= schedule.maxConsecutiveFailures) {
            schedule.status = 'SUSPENDED';
            this.logger.warn(`Schedule ${schedule.id} suspended after ${schedule.consecutiveFailures} consecutive failures`);
            this.notificationService
              .send({
                type: 'scheduled_transaction.suspended',
                userId: schedule.userId,
                payload: { scheduleId: schedule.id, consecutiveFailures: schedule.consecutiveFailures, lastError: err.message },
              })
              .catch((e) => this.logger.error(`Notification failed: ${e.message}`));
          } else {
            schedule.nextRunAt = this.scheduledTxService.calcNextRun(new Date(), schedule.frequency);
          }

          await this.repo.save(schedule);
          this.logger.error(`Schedule ${schedule.id} failed after ${maxAttempts} attempts: ${err.message}`);
        }
      }
    }
  }
}
