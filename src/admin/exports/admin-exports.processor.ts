import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bull';
import { createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Repository } from 'typeorm';
import { Transaction } from '../../transactions/transaction.entity';
import { MailService } from '../../mail/mail.service';
import { ExportStorageService } from './export-storage.service';
import { csvEscape } from './csv.util';
import { ExportTransactionsJobData } from '../dto/export-transactions.dto';

const BATCH_SIZE = 1000;
const CSV_HEADER =
  'id,senderId,receiverId,amount,currency,fee,status,reference,receiptNumber,createdAt';

@Processor('admin-exports')
export class AdminExportsProcessor {
  private readonly logger = new Logger(AdminExportsProcessor.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly storage: ExportStorageService,
    private readonly mailService: MailService,
  ) {}

  @Process('export-transactions')
  async handle(
    job: Job<ExportTransactionsJobData>,
  ): Promise<{ downloadUrl: string; expiresAt: Date }> {
    const { from, to, status, currency, requestedByEmail } = job.data;
    const tmpPath = join(tmpdir(), `export-${job.id}.csv`);
    const out = createWriteStream(tmpPath);
    out.write(CSV_HEADER + '\n');

    // Snapshot the upper bound so rows inserted during a long export cannot
    // shift or extend the result, then page with a keyset on (createdAt, id):
    // OFFSET paging over a non-unique createdAt can duplicate or skip rows.
    const jobStartedAt = new Date();
    const upperBound = new Date(Math.min(new Date(to).getTime(), jobStartedAt.getTime()));

    let cursor: { createdAt: Date; id: string } | null = null;
    let count = 0;
    for (;;) {
      const qb = this.txRepo
        .createQueryBuilder('t')
        .where('t.createdAt >= :from', { from: new Date(from) })
        .andWhere('t.createdAt <= :to', { to: upperBound });
      if (status) qb.andWhere('t.status = :status', { status });
      if (currency) qb.andWhere('t.currency = :currency', { currency });
      if (cursor) {
        qb.andWhere('(t.createdAt > :cAt OR (t.createdAt = :cAt AND t.id > :cId))', {
          cAt: cursor.createdAt,
          cId: cursor.id,
        });
      }
      qb.orderBy('t.createdAt', 'ASC').addOrderBy('t.id', 'ASC').take(BATCH_SIZE);

      const batch = await qb.getMany();
      if (batch.length === 0) break;

      for (const tx of batch) {
        out.write(
          [
            tx.id,
            tx.senderId,
            tx.receiverId,
            tx.amount,
            tx.currency,
            tx.fee,
            tx.status,
            tx.reference,
            tx.receiptNumber,
            tx.createdAt.toISOString(),
          ]
            .map(csvEscape)
            .join(',') + '\n',
        );
      }

      count += batch.length;
      const last = batch[batch.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
      await job.progress(count);
      if (batch.length < BATCH_SIZE) break;
    }

    await new Promise<void>((resolve, reject) =>
      out.end((err?: Error) => (err ? reject(err) : resolve())),
    );

    const { downloadUrl, expiresAt } = this.storage.store(
      tmpPath,
      String(job.id),
      'csv',
    );

    this.mailService.notifyExportReady({
      to: requestedByEmail,
      downloadUrl,
      rowCount: count,
    });

    this.logger.log(`Export job ${job.id} ready: ${count} transactions`);
    return { downloadUrl, expiresAt };
  }
}
