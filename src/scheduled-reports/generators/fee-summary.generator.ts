import { Injectable } from '@nestjs/common';
import { FeeReportsService } from '../../modules/fee-reports/services/fee-reports.service';
import { GenerateFeeReportDto } from '../../modules/fee-reports/dto/generate-fee-report.dto';
import {
  ReportFrequency,
  ReportType,
} from '../entities/scheduled-report.entity';
import {
  GeneratedReport,
  ReportGenerationContext,
  ReportGenerator,
} from './report-generator.interface';

@Injectable()
export class FeeSummaryGenerator implements ReportGenerator {
  readonly reportType = ReportType.FEE_SUMMARY;

  constructor(private readonly feeReportsService: FeeReportsService) {}

  async generate(ctx: ReportGenerationContext): Promise<GeneratedReport> {
    const period =
      ctx.report.frequency === ReportFrequency.WEEKLY
        ? 'weekly'
        : ctx.report.frequency === ReportFrequency.MONTHLY
          ? 'monthly'
          : 'daily';
    const request: GenerateFeeReportDto = {
      period,
      startDate: ctx.periodStart.toISOString(),
      endDate: ctx.periodEnd.toISOString(),
    };
    const report = await this.feeReportsService.generate(
      ctx.report.userId,
      request,
    );

    return {
      payload: {
        reportId: report.id,
        period: report.period,
        startDate: report.startDate,
        endDate: report.endDate,
        totalFees: report.totalFees,
        feeBreakdown: report.feeBreakdown,
        generatedAt: report.generatedAt,
      },
      fileReference: `fee-report:${report.id}`,
      emailText:
        `Your fee summary for ${period} is ready. Total fees: ${report.totalFees}. ` +
        'Sign in to your NexaFx account to view the breakdown.',
    };
  }
}
