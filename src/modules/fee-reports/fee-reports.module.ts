import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeReportEntity } from './entities/fee-report.entity';
import { FeeRecord } from '../../../fees/fee-record.entity';
import { FeeReportsService } from './services/fee-reports.service';
import { FeeReportsController } from './controllers/fee-reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeeReportEntity, FeeRecord]),
  ],
  controllers: [FeeReportsController],
  providers: [FeeReportsService],
  exports: [FeeReportsService],
})
export class FeeReportsModule {}
