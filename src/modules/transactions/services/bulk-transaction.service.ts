import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  BulkBatch,
  BulkBatchMode,
  BulkBatchStatus,
} from '../entities/bulk-batch.entity';
import { TransactionEntity } from '../entities/transaction.entity';
import { TransactionLifecycleService } from './transaction-lifecycle.service';
import { CreateTransactionDto } from '../dto/create-transaction.dto';

const MAX_BULK_ITEMS = 100;
const MAX_STATUS_UPDATE_ITEMS = 500;

@Injectable()
export class BulkTransactionService {
  private readonly logger = new Logger(BulkTransactionService.name);

  constructor(
    @InjectRepository(BulkBatch)
    private readonly batchRepo: Repository<BulkBatch>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly lifecycleService: TransactionLifecycleService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * POST /transactions/bulk
   * Atomic mode: all-or-nothing in a single DB transaction.
   * Best-effort mode: each item processed independently.
   */
  async createBulk(
    userId: string,
    items: CreateTransactionDto[],
    mode: BulkBatchMode,
  ): Promise<BulkBatch> {
    if (items.length === 0 || items.length > MAX_BULK_ITEMS) {
      throw new BadRequestException(
        `Bulk batch must contain 1–${MAX_BULK_ITEMS} items`,
      );
    }

    const batch = await this.batchRepo.save(
      this.batchRepo.create({
        userId,
        mode,
        status: BulkBatchStatus.PROCESSING,
        totalItems: items.length,
        results: [],
      }),
    );

    if (mode === BulkBatchMode.ATOMIC) {
      await this.processAtomic(batch, items);
    } else {
      await this.processBestEffort(batch, items);
    }

    return this.batchRepo.findOneOrFail({ where: { id: batch.id } });
  }

  private async processAtomic(
    batch: BulkBatch,
    items: CreateTransactionDto[],
  ): Promise<void> {
    const results: BulkBatch['results'] = [];

    try {
      await this.dataSource.transaction(async (em) => {
        for (let i = 0; i < items.length; i++) {
          const tx = em.create(TransactionEntity, {
            amount: items[i].amount,
            currency: items[i].currency.toUpperCase(),
            description: items[i].description,
            walletId: items[i].walletId,
            toAddress: items[i].toAddress,
            fromAddress: items[i].fromAddress,
            externalId: items[i].externalId,
            metadata: items[i].metadata,
            status: 'PENDING',
          });
          const saved = await em.save(tx);
          results.push({ index: i, success: true, transactionId: saved.id });
        }
      });

      batch.status = BulkBatchStatus.COMPLETED;
      batch.successCount = items.length;
      batch.results = results;
    } catch (err: any) {
      this.logger.error(`Atomic bulk batch ${batch.id} failed: ${err.message}`);
      batch.status = BulkBatchStatus.FAILED;
      batch.failureCount = items.length;
      batch.results = items.map((_, i) => ({
        index: i,
        success: false,
        error: err.message,
      }));
    }

    await this.batchRepo.save(batch);
  }

  private async processBestEffort(
    batch: BulkBatch,
    items: CreateTransactionDto[],
  ): Promise<void> {
    const results: BulkBatch['results'] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const tx = await this.lifecycleService.create({
          amount: items[i].amount,
          currency: items[i].currency.toUpperCase(),
          description: items[i].description,
          walletId: items[i].walletId,
          toAddress: items[i].toAddress,
          fromAddress: items[i].fromAddress,
          externalId: items[i].externalId,
          metadata: items[i].metadata,
        });
        results.push({ index: i, success: true, transactionId: tx.id });
        batch.successCount++;
      } catch (err: any) {
        results.push({ index: i, success: false, error: err.message });
        batch.failureCount++;
      }
    }

    batch.results = results;
    batch.status =
      batch.failureCount === 0
        ? BulkBatchStatus.COMPLETED
        : batch.successCount === 0
        ? BulkBatchStatus.FAILED
        : BulkBatchStatus.PARTIAL;

    await this.batchRepo.save(batch);
  }

  /** GET /transactions/bulk/:batchId */
  async getBatch(batchId: string): Promise<BulkBatch> {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (!batch) throw new NotFoundException(`Batch ${batchId} not found`);
    return batch;
  }

  /** GET /jobs/:id/status */
  async getJobStatus(jobId: string): Promise<{
    status: BulkBatchStatus;
    downloadUrl: string | null;
    downloadUrlExpiresAt: Date | null;
  }> {
    const batch = await this.getBatch(jobId);
    return {
      status: batch.status,
      downloadUrl: batch.downloadUrl,
      downloadUrlExpiresAt: batch.downloadUrlExpiresAt,
    };
  }

  /**
   * POST /transactions/bulk-export
   * Creates a PENDING export batch and returns jobId.
   * Actual CSV generation is handled by BulkExportProcessor.
   */
  async queueExport(userId: string, filters: Record<string, any>): Promise<{ jobId: string }> {
    const batch = await this.batchRepo.save(
      this.batchRepo.create({
        userId,
        mode: BulkBatchMode.BEST_EFFORT,
        status: BulkBatchStatus.PENDING,
        totalItems: 0,
        results: [],
        metadata: filters,
      } as any),
    );
    return { jobId: batch.id };
  }

  /**
   * POST /admin/transactions/bulk-status-update
   * Updates up to 500 transaction statuses with audit log.
   */
  async adminBulkStatusUpdate(
    updates: Array<{ transactionId: string; status: string }>,
    adminUserId: string,
  ): Promise<{ updated: number; failed: number; results: any[] }> {
    if (updates.length > MAX_STATUS_UPDATE_ITEMS) {
      throw new BadRequestException(
        `Maximum ${MAX_STATUS_UPDATE_ITEMS} status updates per request`,
      );
    }

    let updated = 0;
    let failed = 0;
    const results: any[] = [];

    for (const u of updates) {
      try {
        const tx = await this.txRepo.findOne({ where: { id: u.transactionId } });
        if (!tx) throw new Error('Transaction not found');
        tx.status = u.status as any;
        await this.txRepo.save(tx);
        updated++;
        results.push({ transactionId: u.transactionId, success: true });
      } catch (err: any) {
        failed++;
        results.push({ transactionId: u.transactionId, success: false, error: err.message });
      }
    }

    this.logger.log(
      `Admin bulk status update by ${adminUserId}: ${updated} updated, ${failed} failed`,
    );

    return { updated, failed, results };
  }
}
