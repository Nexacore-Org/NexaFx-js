import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CronExpression } from '@nestjs/schedule';
import { ClusterCron } from '../common/locks/cluster-cron.decorator';
import { LessThanOrEqual, Repository } from 'typeorm';
import {
  ScheduledReport,
  ReportType,
  ReportFrequency,
} from './entities/scheduled-report.entity';

export interface CreateScheduledReportDto {
  userId: string;
  reportType: ReportType;
  frequency: ReportFrequency;
}

@Injectable()
export class ScheduledReportsService {
  constructor(
    @InjectRepository(ScheduledReport)
    private readonly reportRepo: Repository<ScheduledReport>,
  ) {}

  async create(dto: CreateScheduledReportDto): Promise<ScheduledReport> {
    const report = this.reportRepo.create({
      ...dto,
      nextRunAt: this.computeNextRun(dto.frequency),
    });
    return this.reportRepo.save(report);
  }

  async findByUserId(userId: string): Promise<ScheduledReport[]> {
    return this.reportRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async deactivate(id: string): Promise<ScheduledReport> {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) {
      throw new NotFoundException(`Scheduled report ${id} not found`);
    }
    report.isActive = false;
    return this.reportRepo.save(report);
  }

  @ClusterCron(CronExpression.EVERY_MINUTE, 'scheduled-reports:process-due')
  async processDueReports(): Promise<void> {
    const now = new Date();
    const due = await this.reportRepo.find({
      where: { isActive: true, nextRunAt: LessThanOrEqual(now) },
      order: { nextRunAt: 'ASC' },
    });

    for (const report of due) {
      await this.generateReport(report.reportType);
      report.lastRunAt = new Date();
      report.nextRunAt = this.computeNextRun(report.frequency);
      await this.reportRepo.save(report);
    }
  }

  async generateReport(_reportType: ReportType): Promise<Record<string, unknown>> {
    return { generatedAt: new Date(), data: {} };
  }

  private computeNextRun(frequency: ReportFrequency): Date {
    const now = new Date();
    switch (frequency) {
      case ReportFrequency.DAILY:
        now.setDate(now.getDate() + 1);
        break;
      case ReportFrequency.WEEKLY:
        now.setDate(now.getDate() + 7);
        break;
      case ReportFrequency.MONTHLY:
        now.setMonth(now.getMonth() + 1);
        break;
    }
    return now;
  }
}
