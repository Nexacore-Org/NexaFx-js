import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
    ]),
    forwardRef(() => UsersModule),
  ],
  controllers: [AdminController, DashboardController],
  providers: [AdminService, DashboardService],
})
export class AdminModule {}
