import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BulkBatch, BulkBatchStatus } from '../entities/bulk-batch.entity';
import { TransactionEntity } from '../entities/transaction.entity';

const DOWNLOAD_URL_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * BulkExportProcessor picks up PENDING export batches and generates a CSV
 * data-URI as the download URL (expires after 1 hour).
 */
@Injectable()
export class BulkExportProcessor {
  private readonly logger = new Logger(BulkExportProcessor.name);

  constructor(
    @InjectRepository(BulkBatch)
    private readonly batchRepo: Repository<BulkBatch>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  /** Runs every minute to pick up pending export jobs */
  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingExports(): Promise<void> {
    const pending = await this.batchRepo.find({
      where: { status: BulkBatchStatus.PENDING },
    });

    for (const batch of pending) {
      await this.processExport(batch);
    }
  }

  private async processExport(batch: BulkBatch): Promise<void> {
    batch.status = BulkBatchStatus.PROCESSING;
    await this.batchRepo.save(batch);

    try {
      const filters = (batch as any).metadata ?? {};
      const qb = this.txRepo.createQueryBuilder('t').where('1=1');

      if (filters.userId) qb.andWhere('t.walletId IS NOT NULL');
      if (filters.status) qb.andWhere('t.status = :status', { status: filters.status });
      if (filters.from) qb.andWhere('t.createdAt >= :from', { from: new Date(filters.from) });
      if (filters.to) qb.andWhere('t.createdAt <= :to', { to: new Date(filters.to) });

      const transactions = await qb.take(10_000).getMany();

      const csv = this.toCsv(transactions);
      const dataUri = `data:text/csv;base64,${Buffer.from(csv).toString('base64')}`;

      batch.status = BulkBatchStatus.COMPLETED;
      batch.totalItems = transactions.length;
      batch.successCount = transactions.length;
      batch.downloadUrl = dataUri;
      batch.downloadUrlExpiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_MS);

      this.logger.log(`Export batch ${batch.id} completed: ${transactions.length} rows`);
    } catch (err: any) {
      this.logger.error(`Export batch ${batch.id} failed: ${err.message}`);
      batch.status = BulkBatchStatus.FAILED;
    }

    await this.batchRepo.save(batch);
  }

  private toCsv(transactions: TransactionEntity[]): string {
    const header = 'id,amount,currency,status,description,createdAt';
    const rows = transactions.map(
      (t) =>
        `${t.id},${t.amount},${t.currency},${t.status},"${(t.description ?? '').replace(/"/g, '""')}",${t.createdAt.toISOString()}`,
    );
    return [header, ...rows].join('\n');
  }
}
