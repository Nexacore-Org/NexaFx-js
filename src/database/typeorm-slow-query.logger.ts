import { Logger, LoggerService } from '@nestjs/common';
import { Logger as TypeOrmLogger } from 'typeorm';

interface SlowQueryLogPayload {
  event: 'typeorm.slow_query';
  thresholdMs: number;
  durationMs: number;
  query: string;
  parameterCount: number;
}

export class TypeOrmSlowQueryLogger implements TypeOrmLogger {
  private readonly logger: Pick<LoggerService, 'warn'>;

  constructor(
    private readonly thresholdMs: number,
    loggerService?: Pick<LoggerService, 'warn'>,
  ) {
    this.logger = loggerService ?? new Logger(TypeOrmSlowQueryLogger.name);
  }

  logQuery(): void {}

  logQueryError(error: string | Error, query: string): void {
    this.logger.warn(
      JSON.stringify({ event: 'typeorm.query_error', query, error: String(error) }),
    );
  }

  logQuerySlow(time: number, query: string, parameters?: unknown[]): void {
    const payload: SlowQueryLogPayload = {
      event: 'typeorm.slow_query',
      thresholdMs: this.thresholdMs,
      durationMs: time,
      query,
      // Bind parameters can hold password hashes, OTPs and emails: log the count only (issue #1405).
      parameterCount: (parameters ?? []).length,
    };

    this.logger.warn(JSON.stringify(payload));
  }

  logSchemaBuild(): void {}

  logMigration(): void {}

  log(): void {}
}
