import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

interface ArchivalTarget {
  sourceTable: string;
  archiveTable: string;
  dateColumn: string;
}

const TARGETS: ArchivalTarget[] = [
  { sourceTable: 'transactions', archiveTable: 'transactions_archive', dateColumn: 'createdAt' },
  { sourceTable: 'audit_logs', archiveTable: 'audit_logs_archive', dateColumn: 'createdAt' },
];

@Injectable()
export class ArchivalService {
  private readonly logger = new Logger(ArchivalService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async archiveAll(): Promise<void> {
    const enabled = this.config.get<boolean>('archive.enabled');
    if (!enabled) {
      this.logger.log('Archival is disabled — skipping');
      return;
    }

    for (const target of TARGETS) {
      await this.archiveTable(target);
    }
  }

  private async archiveTable(target: ArchivalTarget): Promise<void> {
    const thresholdMonths =
      this.config.get<number>('archive.thresholdMonths') ?? 12;
    const batchSize = this.config.get<number>('archive.batchSize') ?? 500;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - thresholdMonths);

    await this.ensureArchiveTable(target);

    let archived = 0;
    let batch: number;

    do {
      const result = await this.dataSource.query(
        `
        WITH moved AS (
          DELETE FROM "${target.sourceTable}"
          WHERE id IN (
            SELECT id FROM "${target.sourceTable}"
            WHERE "${target.dateColumn}" < $1
            LIMIT $2
          )
          RETURNING *
        )
        INSERT INTO "${target.archiveTable}"
        SELECT *, NOW() AS "archivedAt"
        FROM moved
        `,
        [cutoff, batchSize],
      );
      batch = Array.isArray(result) ? result.length : 0;
      archived += batch;
    } while (batch === batchSize);

    this.logger.log(
      `Archived ${archived} records from ${target.sourceTable}`,
    );
  }

  private async ensureArchiveTable(target: ArchivalTarget): Promise<void> {
    await this.dataSource.query(
      `CREATE TABLE IF NOT EXISTS "${target.archiveTable}"
       (LIKE "${target.sourceTable}" INCLUDING ALL,
        "archivedAt" TIMESTAMP NOT NULL DEFAULT NOW())`,
    );
  }
}
