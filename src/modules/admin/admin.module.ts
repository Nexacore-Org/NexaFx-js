import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { FeatureFlagEntity } from '../feature-flags/entities/feature-flag.entity';
import { RetryJobEntity } from '../retry/entities/retry-job.entity';
import { AdminAuditLogEntity } from '../admin-audit/entities/admin-audit-log.entity';
import { UserEntity } from '../users/entities/user.entity';
import { DeviceEntity } from '../sessions/entities/device.entity';
import { WebhookDeliveryEntity } from '../webhooks/entities/webhook-delivery.entity';
import { ComplianceReport } from '../../compliance-evidence/compliance-report.entity';
import { RpcHealthLogEntity } from '../rpc-health/entities/rpc-health-log.entity';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';
import { UsersModule } from '../users/users.module';
import { LedgerEntry } from '../../double-entry-ledger/ledger-entry.entity';
import { AuditPackage } from './entities/audit-package.entity';
import { LedgerVerificationService } from './services/ledger-verification.service';
import { AuditPackageService } from './services/audit-package.service';
import { AuditController } from './controllers/audit.controller';
import { MonthlyAuditPackageJob } from './jobs/monthly-audit-package.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionEntity,
      FeatureFlagEntity,
      RetryJobEntity,
      AdminAuditLogEntity,
      UserEntity,
      DeviceEntity,
      WebhookDeliveryEntity,
      ComplianceReport,
      RpcHealthLogEntity,
      LedgerEntry,
      AuditPackage,
    ]),
    ScheduleModule.forRoot(),
    forwardRef(() => UsersModule),
  ],
  controllers: [AdminController, DashboardController, AuditController],
  providers: [AdminService, DashboardService, LedgerVerificationService, AuditPackageService, MonthlyAuditPackageJob],
})
export class AdminModule {}
