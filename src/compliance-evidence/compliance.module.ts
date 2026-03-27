import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, getQueueToken } from '@nestjs/bull';
import { ComplianceService, COMPLIANCE_QUEUE } from './compliance.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceReportProcessor } from './compliance-report.processor';
import { ComplianceReport } from './entities/compliance-report.entity';
import { AuditEvidenceLog } from './entities/audit-evidence-log.entity';
import { AmlRuleEntity } from './entities/aml-rule.entity';
import { ComplianceCaseEntity } from './entities/compliance-case.entity';
import { AmlRulesService } from './services/aml-rules.service';
import { ComplianceCaseService } from './services/compliance-case.service';
import { TransactionAmlListener } from './listeners/transaction-aml.listener';
import { AmlAdminController } from './controllers/aml-admin.controller';

const enableBull = process.env.NODE_ENV !== 'test' && process.env.DISABLE_BULL !== 'true';

const queueProviders = enableBull
  ? []
  : [
      {
        provide: getQueueToken(COMPLIANCE_QUEUE),
        useValue: { add: async () => undefined },
      },
    ];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComplianceReport,
      AuditEvidenceLog,
      AmlRuleEntity,
      ComplianceCaseEntity,
    ]),
    ...(enableBull ? [BullModule.registerQueue({ name: COMPLIANCE_QUEUE })] : []),
  ],
  controllers: [ComplianceController, AmlAdminController],
  providers: [
    ComplianceService,
    ComplianceReportProcessor,
    AmlRulesService,
    ComplianceCaseService,
    TransactionAmlListener,
    ...queueProviders,
  ],
  exports: [ComplianceService, AmlRulesService, ComplianceCaseService],
})
export class ComplianceModule {}
