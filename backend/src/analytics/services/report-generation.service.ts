import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, ReportStatus, ReportFormat } from '../entities/report.entity';

@Injectable()
export class ReportGenerationService {
  constructor(
    @InjectQueue('reports') private readonly reportsQueue: Queue,
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
  ) {}
  
  async generateReport(userId: string, format: ReportFormat): Promise<Report> {
    // 1. Create a record in the database for the report
    const report = this.reportRepository.create({ userId, format, status: ReportStatus.PENDING });
    await this.reportRepository.save(report);
    
    // 2. Add the job to the Bull queue for background processing
    await this.reportsQueue.add('generate-report', {
        reportId: report.id,
    });
    
    return report;
  }
}