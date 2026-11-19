import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { FeeReportsModule } from '../modules/fee-reports/fee-reports.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { StatementsModule } from '../statements/statements.module';
import { UsersModule } from '../users/users.module';
import { ScheduledReport } from './entities/scheduled-report.entity';
import { ScheduledReportRun } from './entities/scheduled-report-run.entity';
import { FeeSummaryGenerator } from './generators/fee-summary.generator';
import { PortfolioGenerator } from './generators/portfolio.generator';
import {
  REPORT_GENERATORS,
  ScheduledReportsService,
} from './scheduled-reports.service';
import { ScheduledReportDeliveryService } from './scheduled-report-delivery.service';
import { ScheduledReportsController } from './scheduled-reports.controller';
import { TransactionSummaryGenerator } from './generators/transaction-summary.generator';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledReport, ScheduledReportRun]),
    StatementsModule,
    FeeReportsModule,
    PortfolioModule,
    UsersModule,
    MailModule,
  ],
  controllers: [ScheduledReportsController],
  providers: [
    ScheduledReportsService,
    ScheduledReportDeliveryService,
    TransactionSummaryGenerator,
    FeeSummaryGenerator,
    PortfolioGenerator,
    {
      provide: REPORT_GENERATORS,
      useFactory: (
        transactionSummary: TransactionSummaryGenerator,
        feeSummary: FeeSummaryGenerator,
        portfolio: PortfolioGenerator,
      ) => [transactionSummary, feeSummary, portfolio],
      inject: [
        TransactionSummaryGenerator,
        FeeSummaryGenerator,
        PortfolioGenerator,
      ],
    },
  ],
  exports: [ScheduledReportsService],
})
export class ScheduledReportsModule {}
