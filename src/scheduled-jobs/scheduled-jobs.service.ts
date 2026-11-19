import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { ClusterCron } from '../common/locks/cluster-cron.decorator';
import { DistributedLockService } from '../common/locks/distributed-lock.service';
import { TransactionTimedOutEvent } from '../common/events/transaction-timed-out.event';
import { Otp } from '../otp/otp.entity';
import { PasswordResetToken } from '../auth/password-reset.entity';
import { AuditService } from '../audit/audit.service';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import {
  Transaction,
  TransactionStatus,
} from '../transactions/transaction.entity';
import { WalletsService } from '../wallet/wallets.service';

interface BalanceReversal {
  accountId: string;
  currency: string;
  delta: number;
}

interface FailedTransaction {
  locked: Transaction;
  reversals: BalanceReversal[];
  refundedAt: string;
}

const DEFAULT_LOCK_TTL_MS = 300_000;
const DEFAULT_LOCK_HEARTBEAT_MS = 60_000;
const DEFAULT_RECONCILE_BATCH_SIZE = 100;
const DEFAULT_RECONCILE_TIME_BUDGET_MS = 4 * 60 * 1000;

@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);
  private readonly lockTtlMs: number;
  private readonly lockHeartbeatMs: number;
  private readonly reconcileBatchSize: number;
  private readonly reconcileTimeBudgetMs: number;
  private readonly pendingTimeoutMinutes: number;

  constructor(
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
    private readonly events: EventEmitter2,
    private readonly locks: DistributedLockService,
    @Optional() private readonly refreshTokens?: RefreshTokensService,
  ) {
    this.lockTtlMs =
      this.config.get<number>('scheduledJobs.lockTtlMs') ?? DEFAULT_LOCK_TTL_MS;
    this.lockHeartbeatMs =
      this.config.get<number>('scheduledJobs.lockHeartbeatMs') ??
      DEFAULT_LOCK_HEARTBEAT_MS;
    this.reconcileBatchSize =
      this.config.get<number>('scheduledJobs.reconcileBatchSize') ??
      DEFAULT_RECONCILE_BATCH_SIZE;
    this.reconcileTimeBudgetMs =
      this.config.get<number>('scheduledJobs.reconcileTimeBudgetMs') ??
      DEFAULT_RECONCILE_TIME_BUDGET_MS;
    this.pendingTimeoutMinutes =
      this.config.get<number>('scheduledJobs.pendingTxTimeoutMinutes') ?? 30;
  }

  @ClusterCron(
    CronExpression.EVERY_MINUTE,
    'scheduled-jobs:reconcile-pending-txs',
    {
      ttlMs: DEFAULT_LOCK_TTL_MS,
      heartbeatMs: DEFAULT_LOCK_HEARTBEAT_MS,
    },
  )
  async reconcilePendingTransactions(): Promise<void> {
    const startedAt = Date.now();
    const now = new Date();
    let lastTimeout: Date | undefined;
    let lastId: string | undefined;

    while (Date.now() - startedAt < this.reconcileTimeBudgetMs) {
      const query = this.txRepo
        .createQueryBuilder('tx')
        .where('tx.status = :status', { status: TransactionStatus.PENDING })
        .andWhere('tx.pendingTimeoutAt < :now', { now });

      if (lastTimeout && lastId) {
        query.andWhere(
          '(tx.pendingTimeoutAt > :lastTimeout OR (tx.pendingTimeoutAt = :lastTimeout AND tx.id > :lastId))',
          { lastTimeout, lastId },
        );
      }

      const batch = await query
        .orderBy('tx.pendingTimeoutAt', 'ASC')
        .addOrderBy('tx.id', 'ASC')
        .take(this.reconcileBatchSize)
        .getMany();

      if (batch.length === 0) break;

      for (const tx of batch) {
        if (Date.now() - startedAt >= this.reconcileTimeBudgetMs) return;
        const outcome = await this.locks.runExclusive(
          `tx-processing:${tx.id}`,
          this.lockTtlMs,
          () => this.failTimedOutTransaction(tx),
          { heartbeatMs: this.lockHeartbeatMs },
        );
        if (!outcome.ran) {
          this.logger.debug(`Skipping ${tx.id} — already being processed`);
        }
      }

      const last = batch[batch.length - 1];
      lastTimeout = last.pendingTimeoutAt ?? undefined;
      lastId = last.id;
      if (batch.length < this.reconcileBatchSize) break;
    }
  }

  private async failTimedOutTransaction(stale: Transaction): Promise<void> {
    const failed = await this.dataSource.transaction<FailedTransaction | null>(
      async (manager) => {
        const locked = await manager.findOne(Transaction, {
          where: { id: stale.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (
          !locked ||
          locked.status !== TransactionStatus.PENDING ||
          !locked.pendingTimeoutAt ||
          locked.pendingTimeoutAt >= new Date()
        ) {
          return null;
        }

        const metadata = locked.metadata ?? {};
        if (metadata.autoFailRefundedAt) {
          this.logger.debug(
            `Transaction ${locked.id} was already refunded; skipping`,
          );
          return null;
        }

        const reversals = this.reversalsFor(locked);
        if (reversals === null) {
          const typeLabel =
            typeof metadata.type === 'string' ? metadata.type : 'unknown';
          this.logger.error(
            `Cannot determine how to reverse timed-out transaction ${locked.id} ` +
              `(type=${typeLabel}). Leaving it PENDING for manual review.`,
          );
          return null;
        }

        const refundedAt = new Date().toISOString();
        try {
          for (const reversal of reversals) {
            await this.walletsService.adjustBalance(
              reversal.accountId,
              reversal.currency,
              reversal.delta,
              manager,
              locked.id,
            );
          }
        } catch (err) {
          this.logger.error(
            `Failed to reverse timed-out transaction ${locked.id}; leaving it PENDING. ` +
              `${(err as Error).message}`,
            err instanceof Error ? err.stack : undefined,
          );
          return null;
        }

        locked.status = TransactionStatus.FAILED;
        locked.metadata = {
          ...metadata,
          autoFailedAt: refundedAt,
          ...(reversals.length > 0
            ? { autoFailRefundedAt: refundedAt, autoFailReversals: reversals }
            : {}),
        };
        await manager.save(Transaction, locked);

        return { locked, reversals, refundedAt };
      },
    );

    if (!failed) return;

    const { locked, reversals } = failed;
    await this.auditService.log({
      userId: locked.senderId,
      action:
        reversals.length > 0
          ? 'transaction.auto_failed_refunded'
          : 'transaction.auto_failed',
      entityType: 'transaction',
      entityId: locked.id,
      reason: `Pending for longer than ${this.pendingTimeoutMinutes} minutes`,
      after: { status: TransactionStatus.FAILED, reversals },
    });

    const timedOutEvent: TransactionTimedOutEvent = {
      transactionId: locked.id,
      userId: locked.senderId,
      amount: String(locked.amount),
      currency: locked.currency,
      refunded: reversals.length > 0,
      timestamp: new Date(),
    };
    this.events.emit('transaction.timed_out', timedOutEvent);

    this.logger.warn(
      reversals.length > 0
        ? `Auto-failed timed-out pending transaction ${locked.id} and reversed ${reversals.length} balance movement(s)`
        : `Auto-failed timed-out pending transaction ${locked.id}`,
    );
  }

  private reversalsFor(tx: Transaction): BalanceReversal[] | null {
    const metadata = tx.metadata ?? {};
    const type = metadata.type;
    const debited = Number(tx.amount) + Number(tx.fee ?? 0);

    if (type === 'withdrawal' || type === 'swap') {
      return [
        { accountId: tx.senderId, currency: tx.currency, delta: debited },
      ];
    }

    if (type === 'deposit') {
      return [];
    }

    if (!type && tx.senderId !== tx.receiverId) {
      const amount = Number(tx.amount);
      return [
        { accountId: tx.senderId, currency: tx.currency, delta: amount },
        { accountId: tx.receiverId, currency: tx.currency, delta: -amount },
      ];
    }

    return null;
  }

  @ClusterCron(
    CronExpression.EVERY_DAY_AT_MIDNIGHT,
    'scheduled-jobs:purge-auth-artifacts',
  )
  async purgeSensitiveAuthArtifacts(): Promise<void> {
    const now = new Date();
    const otpCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const passwordResetCutoff = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    );
    const expiredTokenCutoff = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000,
    );

    await this.otpRepo.delete({ expiresAt: LessThan(otpCutoff) });
    await this.passwordResetRepo.delete({
      createdAt: LessThan(passwordResetCutoff),
    });
    await this.passwordResetRepo.delete({
      used: true,
      createdAt: LessThan(expiredTokenCutoff),
    });
    await this.refreshTokens?.purgeStaleTokens();
  }
}
