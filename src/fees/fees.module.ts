import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeRecord } from './fee-record.entity';
import { FeesService } from './fees.service';
import { FeeAuditModule } from '../modules/fee-audit/fee-audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([FeeRecord]), FeeAuditModule],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
