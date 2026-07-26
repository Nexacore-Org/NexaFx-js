import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { StatementsService, StatementRequest } from './statements.service';

@Processor('statements')
export class StatementsProcessor {
  constructor(private readonly statementsService: StatementsService) {}

  @Process('generate')
  async handleGenerate(job: Job<StatementRequest>): Promise<void> {
    const statement = await this.statementsService.buildStatement(job.data);
    await this.statementsService.sendStatementNotification(job.data, statement);
  }
}
