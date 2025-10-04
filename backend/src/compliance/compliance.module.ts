import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './services/compliance.service';
import { RedisService } from './services/redis.service';
import { KycModule } from '../kyc/kyc.module';

// Entities
import { TransactionLimit } from './entities/transaction-limit.entity';
import { ComplianceTransaction } from './entities/compliance-transaction.entity';
import { ComplianceEvent } from './entities/compliance-event.entity';
import { SuspiciousActivityReport } from './entities/suspicious-activity-report.entity';
import { UserFreeze } from './entities/user-freeze.entity';
import { UserWhitelist } from './entities/user-whitelist.entity';
import { SanctionsList } from './entities/sanctions-list.entity';
import { PEPList } from './entities/pep-list.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionLimit,
      ComplianceTransaction,
      ComplianceEvent,
      SuspiciousActivityReport,
      UserFreeze,
      UserWhitelist,
      SanctionsList,
      PEPList,
    ]),
    ConfigModule,
    KycModule,
  ],
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    RedisService,
  ],
  exports: [
    ComplianceService,
    RedisService,
  ],
})
export class ComplianceModule {}
