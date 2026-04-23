import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';
import { DisputesModule } from '../disputes/disputes.module';
import { UserPreferenceEntity } from './entities/user-preference.entity';
import { UserEntity } from './entities/user.entity';
import { UserSettingsEntity } from './entities/user-settings.entity';
import { WalletEntity } from './entities/wallet.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { WalletService } from './wallet.service';
import { UserSettingsService } from './services/user-settings.service';
import { ActivityTimelineService } from './services/activity-timeline.service';
import { FinancialSummaryService } from './services/financial-summary.service';
import { AccountHealthService } from './services/account-health.service';
import { PhoneVerificationService } from './services/phone-verification.service';
import { UserSettingsController } from './controllers/user-settings.controller';
import { PhoneVerificationController } from './controllers/phone-verification.controller';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { AdminAuditLogEntity } from '../admin-audit/entities/admin-audit-log.entity';
import { DeviceEntity } from '../sessions/entities/device.entity';
import { ComplianceReport } from '../../compliance-evidence/compliance-report.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserPreferenceEntity,
      UserEntity,
      UserSettingsEntity,
      WalletEntity,
      TransactionEntity,
      AdminAuditLogEntity,
      DeviceEntity,
      ComplianceReport,
    ]),
    AdminAuditModule,
    DisputesModule,
    forwardRef(() => NotificationsModule),
  ],
  controllers: [UsersController, UserSettingsController, PhoneVerificationController],
  providers: [
    UsersService,
    WalletService,
    UserSettingsService,
    ActivityTimelineService,
    FinancialSummaryService,
    AccountHealthService,
    PhoneVerificationService,
  ],
  exports: [
    UsersService,
    WalletService,
    UserSettingsService,
    ActivityTimelineService,
    PhoneVerificationService,
  ],
})
export class UsersModule {}
