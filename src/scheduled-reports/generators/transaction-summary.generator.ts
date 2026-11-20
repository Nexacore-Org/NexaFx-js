import { Injectable } from '@nestjs/common';
import { StatementsService } from '../../statements/statements.service';
import { ReportType } from '../entities/scheduled-report.entity';
import {
  GeneratedReport,
  ReportGenerationContext,
  ReportGenerator,
} from './report-generator.interface';

@Injectable()
export class TransactionSummaryGenerator implements ReportGenerator {
  readonly reportType = ReportType.TRANSACTION_SUMMARY;

  constructor(private readonly statementsService: StatementsService) {}

  async generate(ctx: ReportGenerationContext): Promise<GeneratedReport> {
    const statement = await this.statementsService.buildStatement({
      userId: ctx.report.userId,
      currency: 'USD',
      from: ctx.periodStart.toISOString(),
      to: ctx.periodEnd.toISOString(),
      format: 'json',
    });

    const payload: Record<string, unknown> = {
      generatedAt: statement.generatedAt,
      currency: statement.currency,
      period: statement.period,
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
      lineCount: statement.lines.length,
      lines: statement.lines,
    };

    return {
      payload,
      emailText:
        `Your transaction summary for ${statement.period.from} to ${statement.period.to} is ready. ` +
        `Closing balance: ${statement.closingBalance} ${statement.currency}. ` +
        'Sign in to your NexaFx account to view it.',
    };
  }
}
