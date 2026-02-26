import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { ComplianceService, COMPLIANCE_QUEUE, GENERATE_REPORT_JOB } from '../compliance.service';

@Processor(COMPLIANCE_QUEUE)
export class ComplianceReportProcessor {
  private readonly logger = new Logger(ComplianceReportProcessor.name);

  constructor(private readonly complianceService: ComplianceService) {}

  @Process(GENERATE_REPORT_JOB)
  async handleGenerateReport(job: Job<{ reportId: string }>): Promise<void> {
    const { reportId } = job.data;
    this.logger.log(`Processing compliance report job: ${reportId}`);
    await this.complianceService.processReport(reportId);
    this.logger.log(`Compliance report job completed: ${reportId}`);
  }
}
