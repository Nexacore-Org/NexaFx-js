import { Injectable } from '@nestjs/common';
import { PortfolioService } from '../../portfolio/portfolio.service';
import { ReportType } from '../entities/scheduled-report.entity';
import {
  GeneratedReport,
  ReportGenerationContext,
  ReportGenerator,
} from './report-generator.interface';

@Injectable()
export class PortfolioGenerator implements ReportGenerator {
  readonly reportType = ReportType.PORTFOLIO;

  constructor(private readonly portfolioService: PortfolioService) {}

  async generate(ctx: ReportGenerationContext): Promise<GeneratedReport> {
    const { holdings, totalValueUsd } =
      await this.portfolioService.getCurrentHoldings(ctx.report.userId);

    return {
      payload: {
        generatedAt: new Date().toISOString(),
        holdings,
        totalValueUsd,
      },
      emailText:
        `Your portfolio report is ready. Current value: ${totalValueUsd} USD. ` +
        'Sign in to your NexaFx account to view your holdings.',
    };
  }
}
