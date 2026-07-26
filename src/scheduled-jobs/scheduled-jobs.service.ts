import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { Otp } from '../otp/otp.entity';
import { PasswordResetToken } from '../auth/password-reset.entity';

@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);
  private readonly lockTtlMs: number;
  private readonly pendingTimeoutMinutes: number;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Otp)
    private readonly otpRepo: Repository<Otp>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetRepo: Repository<PasswordResetToken>,
    private readonly config: ConfigService,
  ) {
    this.lockTtlMs = (this.config.get<number>('scheduledJobs.lockTtlMs') ?? 300_000);
    this.pendingTimeoutMinutes =
      this.config.get<number>('scheduledJobs.pendingTxTimeoutMinutes') ?? 30;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcilePendingTransactions(): Promise<void> {
    const acquiredJobLock = await this.acquireJobLock('reconcile-pending-txs');
    if (!acquiredJobLock) return;

    try {
      const cutoff = new Date(
        Date.now() - this.pendingTimeoutMinutes * 60 * 1000,
      );

      const timedOut = await this.txRepo.find({
        where: {
          status: TransactionStatus.PENDING,
          pendingTimeoutAt: LessThan(cutoff),
        },
      });

      for (const tx of timedOut) {
        const lockKey = `lock:tx-processing:${tx.id}`;
        const acquired = await this.redis.set(
          lockKey,
          '1',
          'PX',
          this.lockTtlMs,
          'NX',
        );
        if (!acquired) {
          this.logger.debug(`Skipping ${tx.id} — already being processed`);
          continue;
        }

        try {
          tx.status = TransactionStatus.FAILED;
          await this.txRepo.save(tx);
          this.logger.warn(
            `Auto-failed timed-out pending transaction ${tx.id}`,
          );
        } finally {
          await this.redis.del(lockKey);
        }
      }
    } finally {
      await this.releaseJobLock('reconcile-pending-txs');
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeSensitiveAuthArtifacts(): Promise<void> {
    const now = new Date();
    const otpCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const passwordResetCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const expiredTokenCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    await this.otpRepo.delete({ expiresAt: LessThan(otpCutoff) });
    await this.passwordResetRepo.delete({ createdAt: LessThan(passwordResetCutoff) });
    await this.passwordResetRepo.delete({
      used: true,
      createdAt: LessThan(expiredTokenCutoff),
    });
  }

  private async acquireJobLock(jobName: string): Promise<boolean> {
    const key = `lock:scheduled-job:${jobName}`;
    const result = await this.redis.set(key, '1', 'PX', this.lockTtlMs, 'NX');
    return result === 'OK';
  }

  private async releaseJobLock(jobName: string): Promise<void> {
    await this.redis.del(`lock:scheduled-job:${jobName}`);
  }
}
