import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { FeatureFlagEntity } from '../feature-flags/entities/feature-flag.entity';
import { RetryJobEntity } from '../retry/entities/retry-job.entity';
import { AdminAuditLogEntity } from '../admin-audit/entities/admin-audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionEntity,
      FeatureFlagEntity,
      RetryJobEntity,
      AdminAuditLogEntity,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
