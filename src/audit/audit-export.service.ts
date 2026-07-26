import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { Transform } from 'stream';

@Injectable()
export class AuditExportService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async streamExport(res: any, startDate: Date, endDate: Date): Promise<void> {
    const diff = endDate.getTime() - startDate.getTime();
    const maxSyncMs = 90 * 24 * 60 * 60 * 1000;

    if (diff > maxSyncMs) {
      res.status(400).json({ message: 'Use async export for ranges > 90 days' });
      return;
    }

    const query = this.repo
      .createQueryBuilder('log')
      .where('log.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
      .orderBy('log.createdAt', 'ASC')
      .stream();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-export.csv"');

    const csvTransform = new Transform({
      objectMode: true,
      transform(row: Record<string, unknown>, _encoding, callback) {
        callback(null, JSON.stringify(row) + '\n');
      },
    });

    query.pipe(csvTransform).pipe(res);
  }
}
