import {
  ReportType,
  ScheduledReport,
} from '../entities/scheduled-report.entity';

export interface ReportGenerationContext {
  report: ScheduledReport;
  periodStart: Date;
  periodEnd: Date;
}

export interface GeneratedReport {
  payload: Record<string, unknown>;
  fileReference?: string;
  emailText: string;
}

export interface ReportGenerator {
  readonly reportType: ReportType;
  generate(ctx: ReportGenerationContext): Promise<GeneratedReport>;
}
