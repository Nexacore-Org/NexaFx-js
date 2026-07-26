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
import { ExportTransactionsJobData } from '../dto/export-transactions.dto';

const BATCH_SIZE = 1000;
const CSV_HEADER =
  'id,senderId,receiverId,amount,currency,fee,status,reference,receiptNumber,createdAt';

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

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

    let skip = 0;
    let count = 0;
    for (;;) {
      const qb = this.txRepo
        .createQueryBuilder('t')
        .where('t.createdAt >= :from', { from: new Date(from) })
        .andWhere('t.createdAt <= :to', { to: new Date(to) });
      if (status) qb.andWhere('t.status = :status', { status });
      if (currency) qb.andWhere('t.currency = :currency', { currency });
      qb.orderBy('t.createdAt', 'ASC').skip(skip).take(BATCH_SIZE);

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
      skip += BATCH_SIZE;
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
