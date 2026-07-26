import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeReportEntity } from './entities/fee-report.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { FeeReportsService } from './services/fee-reports.service';
import { FeeReportsController } from './controllers/fee-reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeeReportEntity, TransactionEntity]),
  ],
  controllers: [FeeReportsController],
  providers: [FeeReportsService],
  exports: [FeeReportsService],
})
export class FeeReportsModule {}
