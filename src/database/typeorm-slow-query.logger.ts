import { Logger, LoggerService } from '@nestjs/common';
import { Logger as TypeOrmLogger } from 'typeorm';

interface SlowQueryLogPayload {
  event: 'typeorm.slow_query';
  thresholdMs: number;
  durationMs: number;
  query: string;
  parameters: unknown[];
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

  logQueryError(): void {}

  logQuerySlow(time: number, query: string, parameters?: unknown[]): void {
    const payload: SlowQueryLogPayload = {
      event: 'typeorm.slow_query',
      thresholdMs: this.thresholdMs,
      durationMs: time,
      query,
      parameters: parameters ?? [],
    };

    this.logger.warn(JSON.stringify(payload));
  }

  logSchemaBuild(): void {}

  logMigration(): void {}

  log(): void {}
}
