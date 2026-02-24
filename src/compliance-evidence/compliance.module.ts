import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ComplianceService, COMPLIANCE_QUEUE } from './compliance.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceReportProcessor } from './jobs/compliance-report.processor';
import { ComplianceReport } from './entities/compliance-report.entity';
import { AuditEvidenceLog } from './entities/audit-evidence-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComplianceReport, AuditEvidenceLog]),
    BullModule.registerQueue({ name: COMPLIANCE_QUEUE }),
  ],
  controllers: [ComplianceController],
  providers: [ComplianceService, ComplianceReportProcessor],
  exports: [ComplianceService],
})
export class ComplianceModule {}
