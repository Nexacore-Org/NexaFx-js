import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES, QUEUE_CONCURRENCY } from './queue.constants';
import {
  ReconcileTransactionsJobData,
  ReconcileBalancesJobData,
  ReconcileLedgerJobData,
  JobResult,
} from './queue.interfaces';
import { ReconciliationService } from '../modules/reconciliation/services/reconciliation.service';
import { WalletService } from '../modules/users/wallet.service';
import { LedgerService } from '../double-entry-ledger/ledger.service';

@Processor(QUEUE_NAMES.RECONCILIATION, {
  concurrency: QUEUE_CONCURRENCY[QUEUE_NAMES.RECONCILIATION],
})
export class ReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReconciliationProcessor.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.DEAD_LETTER) private readonly dlqQueue: Queue,
    private readonly reconciliationService: ReconciliationService,
    private readonly walletService: WalletService,
    private readonly ledgerService: LedgerService,
  ) {
    super();
  }

  async process(job: Job): Promise<JobResult> {
    const start = Date.now();
    this.logger.log(`Processing reconciliation job [${job.name}] id=${job.id}`);

    try {
      let result: unknown;
      switch (job.name) {
        case JOB_NAMES.RECONCILE_TRANSACTIONS:
          result = await this.handleReconcileTransactions(
            job as Job<ReconcileTransactionsJobData>,
          );
          break;
        case JOB_NAMES.RECONCILE_BALANCES:
          result = await this.handleReconcileBalances(
            job as Job<ReconcileBalancesJobData>,
          );
          break;
        case JOB_NAMES.RECONCILE_LEDGER:
          result = await this.handleReconcileLedger(
            job as Job<ReconcileLedgerJobData>,
          );
          break;
        default:
          throw new Error(`Unknown reconciliation job: ${job.name}`);
      }

      return {
        success: true,
        data: result,
        duration: Date.now() - start,
        idempotencyKey: job.data.idempotencyKey,
      };
    } catch (error) {
      this.logger.error(
        `Reconciliation job [${job.name}] failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async handleReconcileTransactions(
    job: Job<ReconcileTransactionsJobData>,
  ) {
    const { startDate, endDate, accountId, forceReconcile, idempotencyKey } = job.data;

    this.logger.log(
      `Reconciling transactions ${startDate} → ${endDate} accountId=${accountId ?? 'all'} force=${forceReconcile} key=${idempotencyKey}`,
    );

    await job.updateProgress(10);
    await this.reconciliationService.runReconciliation();
    await job.updateProgress(60);
    const issues = await this.reconciliationService.getIssues({ page: 1, limit: 1000 });
    await job.updateProgress(100);

    return {
      startDate,
      endDate,
      accountId,
      reconciled: true,
      discrepancies: issues.data.filter((i) => i.status === 'ESCALATED').length,
      totalProcessed: issues.meta.total,
    };
  }

  private async handleReconcileBalances(job: Job<ReconcileBalancesJobData>) {
    const { accountIds, asOfDate, idempotencyKey } = job.data;

    this.logger.log(
      `Reconciling balances for ${accountIds.length} accounts asOf=${asOfDate} key=${idempotencyKey}`,
    );

    await job.updateProgress(25);

    let mismatchCount = 0;
    for (const accountId of accountIds) {
      const wallets = await this.walletService.getWalletsByUser(accountId);
      for (const wallet of wallets) {
        if (wallet.availableBalance < 0) {
          mismatchCount++;
          this.logger.warn(
            `Balance mismatch detected for wallet ${wallet.id} (user ${accountId}): availableBalance=${wallet.availableBalance}`,
          );
        }
      }
    }

    await job.updateProgress(100);

    return {
      accountIds,
      asOfDate,
      reconciled: true,
      mismatchCount,
    };
  }

  private async handleReconcileLedger(job: Job<ReconcileLedgerJobData>) {
    const { ledgerId, period, idempotencyKey } = job.data;

    this.logger.log(
      `Reconciling ledger id=${ledgerId} period=${period} key=${idempotencyKey}`,
    );

    await job.updateProgress(50);
    const result = await this.ledgerService.runIntegrityValidation();
    await job.updateProgress(100);

    return {
      ledgerId,
      period,
      reconciled: result.failed.length === 0,
      entriesVerified: result.checked,
      failedTransactions: result.failed,
    };
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 3);

    if (isFinalAttempt) {
      this.logger.error(
        `Reconciliation job [${job.name}] exhausted — sending to DLQ`,
      );
      await this.dlqQueue.add(
        'process-dlq',
        {
          originalQueue: QUEUE_NAMES.RECONCILIATION,
          originalJobName: job.name,
          originalJobData: job.data,
          failureReason: error.message,
          failedAt: new Date().toISOString(),
          attemptsMade: job.attemptsMade,
          idempotencyKey: `dlq-${job.data.idempotencyKey}`,
        },
        { attempts: 1, removeOnComplete: true },
      );
    }
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job, progress: number) {
    this.logger.verbose(`Reconciliation job [${job.name}] id=${job.id} progress: ${progress}%`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: JobResult) {
    this.logger.log(
      `Reconciliation job [${job.name}] id=${job.id} completed in ${result.duration}ms`,
    );
  }
}
