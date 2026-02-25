import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { QueryArchivedTransactionsDto } from '../dto/query-archived-transactions.dto';
import { QueryArchivedApiLogsDto } from '../dto/query-archived-api-logs.dto';

interface ArchiveRunSummary {
  cutoffDate: string;
  archivedTransactions: number;
  archivedTransactionSnapshots: number;
  archivedTransactionRisks: number;
  archivedApiUsageLogs: number;
}

@Injectable()
export class DataArchiveService {
  private readonly logger = new Logger(DataArchiveService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async runArchivalJob(): Promise<ArchiveRunSummary> {
    const cutoffDate = this.getCutoffDate();
    const batchSize = this.getBatchSize();

    let archivedTransactions = 0;
    let archivedTransactionSnapshots = 0;
    let archivedTransactionRisks = 0;
    let archivedApiUsageLogs = 0;

    while (true) {
      const result = await this.archiveTransactionsBatch(cutoffDate, batchSize);
      archivedTransactions += result.transactions;
      archivedTransactionSnapshots += result.snapshots;
      archivedTransactionRisks += result.risks;

      if (result.transactions < batchSize) {
        break;
      }
    }

    while (true) {
      const archivedCount = await this.archiveApiUsageLogsBatch(
        cutoffDate,
        batchSize,
      );
      archivedApiUsageLogs += archivedCount;
      if (archivedCount < batchSize) {
        break;
      }
    }

    return {
      cutoffDate: cutoffDate.toISOString(),
      archivedTransactions,
      archivedTransactionSnapshots,
      archivedTransactionRisks,
      archivedApiUsageLogs,
    };
  }

  async getArchivedTransactions(query: QueryArchivedTransactionsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const sortOrder = (query.sortOrder ?? 'desc').toUpperCase() as
      | 'ASC'
      | 'DESC';

    const params: any[] = [];
    const conditions: string[] = [];

    if (query.status) {
      params.push(query.status);
      conditions.push(`(a.data->>'status') = $${params.length}`);
    }

    if (query.currency) {
      params.push(query.currency);
      conditions.push(`(a.data->>'currency') = $${params.length}`);
    }

    if (query.q && query.q.trim()) {
      params.push(`%${query.q.trim()}%`);
      conditions.push(`a.data::text ILIKE $${params.length}`);
    }

    if (query.from) {
      params.push(new Date(query.from).toISOString());
      conditions.push(`a.source_created_at >= $${params.length}`);
    }

    if (query.to) {
      params.push(new Date(query.to).toISOString());
      conditions.push(`a.source_created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.dataSource.query(
      `
        SELECT COUNT(*)::int AS total
        FROM archive.transactions_archive a
        ${whereClause}
      `,
      params,
    );

    const total = countResult[0]?.total ?? 0;

    const listParams = [...params, limit, offset];
    const items = await this.dataSource.query(
      `
        SELECT
          a.original_id AS "originalId",
          a.source_created_at AS "sourceCreatedAt",
          a.archived_at AS "archivedAt",
          a.data
        FROM archive.transactions_archive a
        ${whereClause}
        ORDER BY a.source_created_at ${sortOrder}
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      listParams,
    );

    return {
      success: true,
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getArchivedTransactionById(originalId: string) {
    const txRows = await this.dataSource.query(
      `
        SELECT
          a.original_id AS "originalId",
          a.source_created_at AS "sourceCreatedAt",
          a.archived_at AS "archivedAt",
          a.data
        FROM archive.transactions_archive a
        WHERE a.original_id = $1
      `,
      [originalId],
    );

    if (!txRows[0]) {
      throw new NotFoundException('Archived transaction not found');
    }

    const [snapshots, risks] = await Promise.all([
      this.dataSource.query(
        `
          SELECT
            a.original_id AS "originalId",
            a.source_created_at AS "sourceCreatedAt",
            a.archived_at AS "archivedAt",
            a.data
          FROM archive.transaction_execution_snapshots_archive a
          WHERE (a.data->>'transactionId') = $1
          ORDER BY a.source_created_at ASC
        `,
        [originalId],
      ),
      this.dataSource.query(
        `
          SELECT
            a.original_id AS "originalId",
            a.source_created_at AS "sourceCreatedAt",
            a.archived_at AS "archivedAt",
            a.data
          FROM archive.transaction_risks_archive a
          WHERE (a.data->>'transactionId') = $1
        `,
        [originalId],
      ),
    ]);

    return {
      success: true,
      data: {
        transaction: txRows[0],
        snapshots,
        risks,
      },
    };
  }

  async getArchivedApiUsageLogs(query: QueryArchivedApiLogsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const params: any[] = [];
    const conditions: string[] = [];

    if (query.route) {
      params.push(query.route);
      conditions.push(`(a.data->>'route') = $${params.length}`);
    }

    if (query.method) {
      params.push(query.method.toUpperCase());
      conditions.push(`UPPER(a.data->>'method') = $${params.length}`);
    }

    if (query.statusCode) {
      params.push(String(query.statusCode));
      conditions.push(`(a.data->>'statusCode') = $${params.length}`);
    }

    if (query.from) {
      params.push(new Date(query.from).toISOString());
      conditions.push(`a.source_created_at >= $${params.length}`);
    }

    if (query.to) {
      params.push(new Date(query.to).toISOString());
      conditions.push(`a.source_created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.dataSource.query(
      `
        SELECT COUNT(*)::int AS total
        FROM archive.api_usage_logs_archive a
        ${whereClause}
      `,
      params,
    );

    const total = countResult[0]?.total ?? 0;

    const listParams = [...params, limit, offset];
    const items = await this.dataSource.query(
      `
        SELECT
          a.original_id AS "originalId",
          a.source_created_at AS "sourceCreatedAt",
          a.archived_at AS "archivedAt",
          a.data
        FROM archive.api_usage_logs_archive a
        ${whereClause}
        ORDER BY a.source_created_at DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      listParams,
    );

    return {
      success: true,
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async restoreTransaction(originalId: string, restoredBy: string) {
    return this.dataSource.transaction(async (manager) => {
      const archivedRows = await manager.query(
        `
          SELECT data
          FROM archive.transactions_archive
          WHERE original_id = $1
          LIMIT 1
        `,
        [originalId],
      );

      if (!archivedRows[0]) {
        throw new NotFoundException('Archived transaction not found');
      }

      const existingRows = await manager.query(
        `SELECT id FROM transactions WHERE id = $1 LIMIT 1`,
        [originalId],
      );

      if (existingRows[0]) {
        throw new ConflictException('Transaction already exists in primary storage');
      }

      await manager.query(
        `
          INSERT INTO transactions
          SELECT (jsonb_populate_record(NULL::transactions, ($1::jsonb - 'search_vector' - 'searchVector'))).* 
        `,
        [archivedRows[0].data],
      );

      const restoredRisksResult = await manager.query(
        `
          INSERT INTO transaction_risks
          SELECT (jsonb_populate_record(NULL::transaction_risks, a.data)).*
          FROM archive.transaction_risks_archive a
          WHERE (a.data->>'transactionId') = $1
          ON CONFLICT ("transactionId") DO NOTHING
        `,
        [originalId],
      );

      const restoredSnapshotsResult = await manager.query(
        `
          INSERT INTO transaction_execution_snapshots
          SELECT (jsonb_populate_record(NULL::transaction_execution_snapshots, a.data)).*
          FROM archive.transaction_execution_snapshots_archive a
          WHERE (a.data->>'transactionId') = $1
          ON CONFLICT (id) DO NOTHING
        `,
        [originalId],
      );

      await manager.query(
        `
          DELETE FROM archive.transaction_execution_snapshots_archive
          WHERE (data->>'transactionId') = $1
        `,
        [originalId],
      );

      await manager.query(
        `
          DELETE FROM archive.transaction_risks_archive
          WHERE (data->>'transactionId') = $1
        `,
        [originalId],
      );

      await manager.query(
        `DELETE FROM archive.transactions_archive WHERE original_id = $1`,
        [originalId],
      );

      this.logger.warn(
        `Archived transaction restored: ${originalId} by ${restoredBy}`,
      );

      return {
        success: true,
        data: {
          transactionId: originalId,
          restoredBy,
          restoredRisks: restoredRisksResult?.rowCount ?? 0,
          restoredSnapshots: restoredSnapshotsResult?.rowCount ?? 0,
        },
      };
    });
  }

  async restoreApiUsageLog(originalId: string, restoredBy: string) {
    return this.dataSource.transaction(async (manager) => {
      const archivedRows = await manager.query(
        `
          SELECT data
          FROM archive.api_usage_logs_archive
          WHERE original_id = $1
          LIMIT 1
        `,
        [originalId],
      );

      if (!archivedRows[0]) {
        throw new NotFoundException('Archived API usage log not found');
      }

      const existingRows = await manager.query(
        `SELECT id FROM api_usage_logs WHERE id = $1 LIMIT 1`,
        [originalId],
      );

      if (existingRows[0]) {
        throw new ConflictException('API usage log already exists in primary storage');
      }

      await manager.query(
        `
          INSERT INTO api_usage_logs
          SELECT (jsonb_populate_record(NULL::api_usage_logs, $1::jsonb)).*
        `,
        [archivedRows[0].data],
      );

      await manager.query(
        `DELETE FROM archive.api_usage_logs_archive WHERE original_id = $1`,
        [originalId],
      );

      this.logger.warn(
        `Archived API usage log restored: ${originalId} by ${restoredBy}`,
      );

      return {
        success: true,
        data: {
          logId: originalId,
          restoredBy,
        },
      };
    });
  }

  private async archiveTransactionsBatch(cutoffDate: Date, batchSize: number) {
    return this.dataSource.transaction(async (manager) => {
      const transactionRows = await manager.query(
        `
          SELECT id
          FROM transactions
          WHERE "createdAt" < $1
          ORDER BY "createdAt" ASC
          LIMIT $2
        `,
        [cutoffDate.toISOString(), batchSize],
      );

      const transactionIds: string[] = transactionRows.map((row: { id: string }) => row.id);
      if (transactionIds.length === 0) {
        return {
          transactions: 0,
          snapshots: 0,
          risks: 0,
        };
      }

      const txInsertResult = await manager.query(
        `
          INSERT INTO archive.transactions_archive (original_id, source_created_at, data)
          SELECT
            t.id,
            t."createdAt",
            to_jsonb(t)
          FROM transactions t
          WHERE t.id = ANY($1::uuid[])
          ON CONFLICT (original_id) DO NOTHING
        `,
        [transactionIds],
      );

      const snapshotInsertResult = await manager.query(
        `
          INSERT INTO archive.transaction_execution_snapshots_archive (original_id, source_created_at, data)
          SELECT
            s.id,
            s."createdAt",
            to_jsonb(s)
          FROM transaction_execution_snapshots s
          WHERE s."transactionId" = ANY($1::text[])
          ON CONFLICT (original_id) DO NOTHING
        `,
        [transactionIds],
      );

      const riskInsertResult = await manager.query(
        `
          INSERT INTO archive.transaction_risks_archive (original_id, source_created_at, data)
          SELECT
            r.id,
            r."createdAt",
            to_jsonb(r)
          FROM transaction_risks r
          WHERE r."transactionId" = ANY($1::uuid[])
          ON CONFLICT (original_id) DO NOTHING
        `,
        [transactionIds],
      );

      await manager.query(
        `
          DELETE FROM transaction_execution_snapshots
          WHERE "transactionId" = ANY($1::text[])
        `,
        [transactionIds],
      );

      await manager.query(
        `
          DELETE FROM transaction_risks
          WHERE "transactionId" = ANY($1::uuid[])
        `,
        [transactionIds],
      );

      await manager.query(
        `
          DELETE FROM transactions
          WHERE id = ANY($1::uuid[])
        `,
        [transactionIds],
      );

      return {
        transactions: txInsertResult?.rowCount ?? transactionIds.length,
        snapshots: snapshotInsertResult?.rowCount ?? 0,
        risks: riskInsertResult?.rowCount ?? 0,
      };
    });
  }

  private async archiveApiUsageLogsBatch(cutoffDate: Date, batchSize: number) {
    return this.dataSource.transaction(async (manager) => {
      const logRows = await manager.query(
        `
          SELECT id
          FROM api_usage_logs
          WHERE "createdAt" < $1
          ORDER BY "createdAt" ASC
          LIMIT $2
        `,
        [cutoffDate.toISOString(), batchSize],
      );

      const logIds: string[] = logRows.map((row: { id: string }) => row.id);
      if (logIds.length === 0) {
        return 0;
      }

      const insertResult = await manager.query(
        `
          INSERT INTO archive.api_usage_logs_archive (original_id, source_created_at, data)
          SELECT
            l.id,
            l."createdAt",
            to_jsonb(l)
          FROM api_usage_logs l
          WHERE l.id = ANY($1::uuid[])
          ON CONFLICT (original_id) DO NOTHING
        `,
        [logIds],
      );

      await manager.query(
        `
          DELETE FROM api_usage_logs
          WHERE id = ANY($1::uuid[])
        `,
        [logIds],
      );

      return insertResult?.rowCount ?? logIds.length;
    });
  }

  private getCutoffDate(): Date {
    const thresholdMonths =
      this.configService.get<number>('archive.thresholdMonths') ?? 12;

    const date = new Date();
    date.setMonth(date.getMonth() - thresholdMonths);
    return date;
  }

  private getBatchSize(): number {
    return this.configService.get<number>('archive.batchSize') ?? 500;
  }

  isArchiveEnabled(): boolean {
    return this.configService.get<boolean>('archive.enabled') ?? true;
  }
}
