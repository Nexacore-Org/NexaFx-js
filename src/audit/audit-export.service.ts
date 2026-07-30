import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { Transform } from 'stream';
import { PDFDocument, rgb } from 'pdf-lib';

@Injectable()
export class AuditExportService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async streamExport(res: any, startDate: Date, endDate: Date, format: string = 'csv'): Promise<void> {
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

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-export.json"');
      res.write('[');
      let isFirst = true;
      const jsonTransform = new Transform({
        objectMode: true,
        transform(row: Record<string, unknown>, _encoding, callback) {
          const prefix = isFirst ? '' : ',';
          isFirst = false;
          callback(null, prefix + JSON.stringify(row));
        },
        flush(callback) {
          this.push(']');
          callback();
        }
      });
      query.pipe(jsonTransform).pipe(res);
      return;
    }

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-export.pdf"');
      
      const doc = await PDFDocument.create();
      let page = doc.addPage([600, 800]);
      let y = 750;
      page.drawText('Audit Logs Export', { x: 50, y, size: 20 });
      y -= 30;

      query.on('data', (row: any) => {
        if (y < 50) {
          page = doc.addPage([600, 800]);
          y = 750;
        }
        const text = `${row.log_createdAt?.toISOString?.() || row.log_createdAt} - ${row.log_userId} - ${row.log_action}`;
        page.drawText(text.substring(0, 80), { x: 50, y, size: 10 });
        y -= 15;
      });

      query.on('end', async () => {
        const pdfBytes = await doc.save();
        res.end(Buffer.from(pdfBytes));
      });
      return;
    }

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
