import { OnQueueFailed, Processor, Process } from '@nestjs/bull';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Job } from 'bull';
import { AuditService } from '../audit/audit.service';
import { QUEUE_NAMES } from '../queues/queue.constants';
import { StatementsService, StatementRequest } from './statements.service';

@Injectable()
@Processor(QUEUE_NAMES.STATEMENTS)
export class StatementsProcessor {
  private readonly logger = new Logger(StatementsProcessor.name);

  constructor(
    private readonly statementsService: StatementsService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  @Process('generate')
  async handleGenerate(job: Job<StatementRequest>): Promise<void> {
    const statement = await this.statementsService.buildStatement(job.data);
    await this.statementsService.sendStatementNotification(job.data, statement);
  }

  @OnQueueFailed()
  onFailed(job: Job<StatementRequest>, error: Error): void {
    const maxAttempts = job.opts.attempts ?? 1;
    const deadLetter = job.attemptsMade >= maxAttempts;
    const message =
      `[${deadLetter ? 'DEAD-LETTER' : 'FAILED'}] statements job ${job.id} ` +
      `(user ${job.data?.userId ?? 'unknown'}) after ${job.attemptsMade} ` +
      `attempt(s): ${error.message}`;
    if (deadLetter) this.logger.error(message, error.stack);
    else this.logger.warn(message);

    void this.audit
      ?.log({
        action: deadLetter
          ? 'statement.generation.dead_letter'
          : 'statement.generation.failed',
        entityType: 'statement_request',
        entityId: String(job.data?.userId ?? job.id ?? ''),
        after: {
          jobId: job.id,
          currency: job.data?.currency,
          attemptsMade: job.attemptsMade,
          failedReason: error.message,
          deadLetter,
        },
      })
      .catch((auditError: unknown) => {
        this.logger.error(
          `Failed to write statement failure audit event: ${(auditError as Error).message}`,
        );
      });
  }
}
