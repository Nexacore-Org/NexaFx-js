import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ReportSchedulerService } from '../services/report-scheduler.service';
import { AdminGuard } from '../../modules/auth/guards/admin.guard';
import { ReportType } from '../report-type.enum';
import { ReportScheduleFrequency } from '../entities/report-schedule.entity';

@Controller('admin/compliance')
@UseGuards(AdminGuard)
export class ReportScheduleController {
  constructor(private readonly scheduler: ReportSchedulerService) {}

  @Post('report-schedules')
  create(@Body() body: Record<string, any>) {
    return this.scheduler.createSchedule({
      recipientEmails: body.recipientEmails ?? body.emails ?? [],
      frequency: this.getFrequency(body.frequency ?? body.schedule),
      reportType: body.reportType ?? ReportType.AUDIT_SNAPSHOT,
    });
  }

  @Get('report-schedules')
  list() {
    return this.scheduler.listSchedules();
  }

  @Get('reports')
  reports() {
    return this.scheduler.listGeneratedReports();
  }

  private getFrequency(value?: string): ReportScheduleFrequency {
    return value === 'WEEKLY' || value === 'MONTHLY' ? value : 'DAILY';
  }
}
