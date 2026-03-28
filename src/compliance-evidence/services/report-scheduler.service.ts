import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegulatoryReport } from '../entities/regulatory-report.entity';
import { createHash } from 'crypto';

export interface ReportSchedule {
  id: string;
  emails: string[];
  cron: string;
}

@Injectable()
export class ReportSchedulerService {
  private schedules: ReportSchedule[] = [];

  constructor(
    @InjectRepository(RegulatoryReport)
    private readonly reportRepo: Repository<RegulatoryReport>,
  ) {}

  createSchedule(emails: string[], cron: string) {
    const id = Math.random().toString(36).slice(2);
    const schedule = { id, emails, cron };
    this.schedules.push(schedule);
    return schedule;
  }

  listSchedules() {
    return this.schedules;
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async generateAndSendReports() {
    // Generate report (placeholder: fetch all filed reports)
    const reports = await this.reportRepo.find({ where: { status: 'FILED' } });
    const content = JSON.stringify(reports);
    const checksum = createHash('sha256').update(content).digest('hex');
    // Store report with checksum (placeholder: just log)
    // Send email to all recipients (placeholder: just log)
    for (const schedule of this.schedules) {
      // In real impl, generate PDF/CSV, store, and email
      console.log(`Emailing compliance report to ${schedule.emails.join(', ')} with checksum ${checksum}`);
    }
    return { count: reports.length, checksum };
  }
}
