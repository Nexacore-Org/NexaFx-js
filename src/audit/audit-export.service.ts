import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { Transform } from 'stream';
import { PDFDocument } from 'pdf-lib';

/** Columns in the exported audit trail, in entity order. */
export const AUDIT_CSV_COLUMNS = [
  'id',
  'userId',
  'action',
  'entityType',
  'entityId',
  'before',
  'after',
  'reason',
  'ipAddress',
  'userAgent',
  'createdAt',
] as const;

export type AuditExportFormat = 'csv' | 'json' | 'pdf';
export const AUDIT_EXPORT_FORMATS: AuditExportFormat[] = ['csv', 'json', 'pdf'];

const MAX_SYNC_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * TypeORM's `stream()` returns rows keyed by entity alias (`log_userId`).
 * The export exposes the documented `AuditLog` field names instead.
 */
export function mapAuditRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.log_id,
    userId: row.log_userId,
    action: row.log_action,
    entityType: row.log_entityType,
    entityId: row.log_entityId,
    before: row.log_before,
    after: row.log_after,
    reason: row.log_reason,
    ipAddress: row.log_ipAddress,
    userAgent: row.log_userAgent,
    createdAt: row.log_createdAt,
  };
}

/**
 * RFC-4180 quoting plus formula-injection protection for spreadsheet tools.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text: string;
  if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === 'object') {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }

  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function auditRowToCsv(row: Record<string, unknown>): string {
  const mapped = mapAuditRow(row);
  return AUDIT_CSV_COLUMNS.map((column) => escapeCsvCell(mapped[column])).join(',');
}

export function auditCsvHeader(): string {
  return AUDIT_CSV_COLUMNS.join(',');
}

@Injectable()
export class AuditExportService {
  private readonly logger = new Logger(AuditExportService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async streamExport(
    res: any,
    startDate: Date,
    endDate: Date,
    format: AuditExportFormat = 'csv',
  ): Promise<void> {
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      res.status(400).json({ message: 'from and to must be valid dates' });
      return;
    }
    if (startDate > endDate) {
      res.status(400).json({ message: 'from must be before or equal to to' });
      return;
    }
    if (endDate.getTime() - startDate.getTime() > MAX_SYNC_MS) {
      res.status(400).json({ message: 'Use async export for ranges > 90 days' });
      return;
    }

    const query = this.repo
      .createQueryBuilder('log')
      .where('log.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
      .orderBy('log.createdAt', 'ASC')
      .stream();

    query.on('error', (err: Error) => {
      this.logger.error(`Audit export failed: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Audit export failed' });
      } else {
        res.destroy(err);
      }
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-export.json"');
      let first = true;
      const jsonTransform = new Transform({
        objectMode: true,
        transform(row: Record<string, unknown>, _encoding, callback) {
          callback(null, `${first ? '[' : ','}${JSON.stringify(mapAuditRow(row))}`);
          first = false;
        },
        flush(callback) {
          this.push(']');
          callback();
        },
      });
      jsonTransform.on('error', (err) => res.destroy(err));
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

      query.on('data', (row: Record<string, unknown>) => {
        const mapped = mapAuditRow(row);
        if (y < 50) {
          page = doc.addPage([600, 800]);
          y = 750;
        }
        const created = mapped.createdAt as Date | string | undefined;
        const text = `${created instanceof Date ? created.toISOString() : (created ?? '')} - ${mapped.userId ?? ''} - ${mapped.action ?? ''}`;
        page.drawText(text.substring(0, 80), { x: 50, y, size: 10 });
        y -= 15;
      });

      query.on('end', async () => {
        try {
          const pdfBytes = await doc.save();
          res.end(Buffer.from(pdfBytes));
        } catch (err) {
          this.logger.error(`PDF audit export failed: ${(err as Error).message}`);
          res.destroy(err as Error);
        }
      });
      return;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-export.csv"');
    res.write(`${auditCsvHeader()}\n`);

    const csvTransform = new Transform({
      objectMode: true,
      transform(row: Record<string, unknown>, _encoding, callback) {
        callback(null, `${auditRowToCsv(row)}\n`);
      },
    });
    csvTransform.on('error', (err) => res.destroy(err));
    query.pipe(csvTransform).pipe(res);
  }
}
