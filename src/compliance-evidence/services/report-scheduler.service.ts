import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { ComplianceReport } from '../entities/compliance-report.entity';
import {
  ReportScheduleEntity,
  ReportScheduleFrequency,
} from '../entities/report-schedule.entity';
import { ExportFormat, ReportStatus, ReportType } from '../report-type.enum';
import { MailService } from '../../modules/mail/services/mail.service';

export interface ReportSchedule {
  id: string;
  recipientEmails: string[];
  frequency: ReportScheduleFrequency;
  reportType: ReportType;
}

@Injectable()
export class ReportSchedulerService {
  constructor(
    @InjectRepository(ComplianceReport)
    private readonly reportRepo: Repository<ComplianceReport>,
    @InjectRepository(ReportScheduleEntity)
    private readonly scheduleRepo: Repository<ReportScheduleEntity>,
    @Optional() private readonly mailService?: MailService,
  ) {}

  async createSchedule(input: {
    recipientEmails: string[];
    frequency: ReportScheduleFrequency;
    reportType: ReportType;
  }) {
    const schedule = this.scheduleRepo.create({
      ...input,
      nextRunAt: this.nextRunAt(input.frequency),
      isActive: true,
    });
    return this.scheduleRepo.save(schedule);
  }

  listSchedules() {
    return this.scheduleRepo.find({ order: { createdAt: 'DESC' } });
  }

  listGeneratedReports() {
    return this.reportRepo.find({
      order: { createdAt: 'DESC' },
      select: {
        id: true,
        reportType: true,
        exportFormat: true,
        status: true,
        exportPath: true,
        checksum: true,
        recordCount: true,
        completedAt: true,
        createdAt: true,
      },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async generateAndSendReports() {
    const dueSchedules = await this.scheduleRepo
      .createQueryBuilder('schedule')
      .where('schedule.isActive = :active', { active: true })
      .andWhere('(schedule.nextRunAt IS NULL OR schedule.nextRunAt <= :now)', {
        now: new Date(),
      })
      .getMany();

    const generated: ComplianceReport[] = [];
    for (const schedule of dueSchedules) {
      const report = await this.generateReportForSchedule(schedule);
      generated.push(report);
      schedule.lastRunAt = new Date();
      schedule.nextRunAt = this.nextRunAt(schedule.frequency);
      await this.scheduleRepo.save(schedule);
      await this.emailReport(schedule, report);
    }

    return { count: generated.length, reports: generated };
  }

  private async generateReportForSchedule(schedule: ReportScheduleEntity) {
    const sourceReports = await this.reportRepo.find({
      where: { reportType: schedule.reportType },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const reportData = {
      scheduleId: schedule.id,
      generatedAt: new Date().toISOString(),
      sourceReportIds: sourceReports.map((report) => report.id),
    };
    const checksum = createHash('sha256')
      .update(JSON.stringify(reportData))
      .digest('hex');

    const report = this.reportRepo.create({
      reportType: schedule.reportType,
      exportFormat: ExportFormat.JSON,
      status: ReportStatus.COMPLETED,
      requestedBy: 'scheduler',
      filters: { scheduleId: schedule.id },
      reportData,
      checksum,
      exportPath: `/admin/compliance/reports/${checksum}.json`,
      recordCount: sourceReports.length,
      completedAt: new Date(),
    });
    return this.reportRepo.save(report);
  }

  private async emailReport(
    schedule: ReportScheduleEntity,
    report: ComplianceReport,
  ) {
    const mailer = this.mailService as any;
    if (!mailer?.sendComplianceReport) return;

    await Promise.all(
      schedule.recipientEmails.map((email) =>
        mailer.sendComplianceReport(email, {
          reportId: report.id,
          reportType: report.reportType,
          checksum: report.checksum,
          downloadUrl: report.exportPath,
        }),
      ),
    );
  }

  private nextRunAt(frequency: ReportScheduleFrequency) {
    const next = new Date();
    if (frequency === 'MONTHLY') next.setMonth(next.getMonth() + 1);
    else if (frequency === 'WEEKLY') next.setDate(next.getDate() + 7);
    else next.setDate(next.getDate() + 1);
    return next;
  }
}
