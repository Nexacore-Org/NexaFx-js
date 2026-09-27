import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { Otp } from '../otp/otp.entity';
import { PasswordResetToken } from '../auth/password-reset.entity';
import { WalletsService } from '../wallet/wallets.service';
import { AuditService } from '../audit/audit.service';

/** A balance movement that must be undone before a transaction is auto-failed. */
interface BalanceReversal {
  accountId: string;
  currency: string;
  delta: number;
}

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
    private readonly dataSource: DataSource,
    private readonly walletsService: WalletsService,
    private readonly auditService: AuditService,
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
          await this.failTimedOutTransaction(tx);
        } finally {
          await this.redis.del(lockKey);
        }
      }
    } finally {
      await this.releaseJobLock('reconcile-pending-txs');
    }
  }

  /**
   * Marks a timed-out PENDING transaction FAILED, first undoing any balance
   * movement that was already applied when it was created. Withdrawals, swaps
   * and transfers all debit the wallet before the COMPLETED write, so failing
   * them without a compensating credit permanently destroys the debited funds.
   */
  private async failTimedOutTransaction(tx: Transaction): Promise<void> {
    const metadata = (tx.metadata ?? {}) as Record<string, unknown>;

    if (metadata.autoFailRefundedAt) {
      this.logger.debug(`Transaction ${tx.id} was already refunded; skipping`);
      return;
    }

    const reversals = this.reversalsFor(tx);

    if (reversals === null) {
      this.logger.error(
        `Cannot determine how to reverse timed-out transaction ${tx.id} ` +
          `(type=${String(metadata.type ?? 'unknown')}). Leaving it PENDING for manual review.`,
      );
      return;
    }

    const refundedAt = new Date().toISOString();

    try {
      await this.dataSource.transaction(async (manager) => {
        for (const reversal of reversals) {
          await this.walletsService.adjustBalance(
            reversal.accountId,
            reversal.currency,
            reversal.delta,
            manager,
          );
        }

        tx.status = TransactionStatus.FAILED;
        tx.metadata = {
          ...metadata,
          autoFailedAt: refundedAt,
          ...(reversals.length > 0
            ? { autoFailRefundedAt: refundedAt, autoFailReversals: reversals }
            : {}),
        };
        await manager.save(Transaction, tx);
      });
    } catch (err) {
      // A reversal can legitimately fail — e.g. a transfer whose recipient has
      // already spent the credited funds. Leave the row PENDING so the next run
      // (or an operator) can retry rather than failing it with funds unreturned.
      this.logger.error(
        `Failed to reverse timed-out transaction ${tx.id}; leaving it PENDING. ` +
          `${(err as Error).message}`,
        err instanceof Error ? err.stack : undefined,
      );
      return;
    }

    await this.auditService.log({
      userId: tx.senderId,
      action:
        reversals.length > 0
          ? 'transaction.auto_failed_refunded'
          : 'transaction.auto_failed',
      entityType: 'transaction',
      entityId: tx.id,
      reason: `Pending for longer than ${this.pendingTimeoutMinutes} minutes`,
      after: { status: TransactionStatus.FAILED, reversals },
    });

    this.logger.warn(
      reversals.length > 0
        ? `Auto-failed timed-out pending transaction ${tx.id} and reversed ${reversals.length} balance movement(s)`
        : `Auto-failed timed-out pending transaction ${tx.id}`,
    );
  }

  /**
   * Returns the balance movements to undo, or `null` when the transaction's
   * shape is unrecognised and reversing it would be guesswork.
   */
  private reversalsFor(tx: Transaction): BalanceReversal[] | null {
    const metadata = (tx.metadata ?? {}) as Record<string, unknown>;
    const type = metadata.type;
    // Withdrawals and swaps debit amount + fee up front.
    const debited = Number(tx.amount) + Number(tx.fee ?? 0);

    if (type === 'withdrawal' || type === 'swap') {
      return [
        { accountId: tx.senderId, currency: tx.currency, delta: debited },
      ];
    }

    if (type === 'deposit') {
      // Deposits only credit on the success path, so there is nothing owed back.
      // A deposit stuck PENDING may have credited before the confirming write,
      // which is a clawback decision for an operator rather than this job.
      return [];
    }

    if (!type && tx.senderId !== tx.receiverId) {
      // Peer transfer: the sender was debited and the receiver credited.
      const amount = Number(tx.amount);
      return [
        { accountId: tx.senderId, currency: tx.currency, delta: amount },
        { accountId: tx.receiverId, currency: tx.currency, delta: -amount },
      ];
    }

    return null;
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
