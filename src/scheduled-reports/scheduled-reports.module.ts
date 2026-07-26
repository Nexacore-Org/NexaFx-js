import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledReport } from './entities/scheduled-report.entity';
import { ScheduledReportsService } from './scheduled-reports.service';
import { ScheduledReportsController } from './scheduled-reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ScheduledReport])],
  controllers: [ScheduledReportsController],
  providers: [ScheduledReportsService],
  exports: [ScheduledReportsService],
})
export class ScheduledReportsModule {}
