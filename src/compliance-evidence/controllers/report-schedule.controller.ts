import { Controller, Get, Post, Body } from '@nestjs/common';
import { ReportSchedulerService } from '../services/report-scheduler.service';

@Controller('admin/compliance/report-schedules')
export class ReportScheduleController {
  constructor(private readonly scheduler: ReportSchedulerService) {}

  @Post()
  create(@Body('emails') emails: string[], @Body('cron') cron: string) {
    return this.scheduler.createSchedule(emails, cron);
  }

  @Get()
  list() {
    return this.scheduler.listSchedules();
  }
}
