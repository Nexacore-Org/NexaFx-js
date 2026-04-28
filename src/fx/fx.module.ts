import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FxQuote } from './entities/fx-quote.entity';
import { FxConversion } from './entities/fx-conversion.entity';
import { WalletEntity } from '../modules/users/entities/wallet.entity';
import { TransactionEntity } from '../modules/transactions/entities/transaction.entity';

import { FxConversionService } from './services/fx-conversion.service';
import { FeeCalculatorService } from './services/fee-calculator.service';
import { RegulatoryDisclosureService } from './services/regulatory-disclosure.service';
import { RateProviderService } from './services/rate-provider.service';
import { FxSlaAlertCron } from './services/fx-sla-alert.cron';

import { FxConversionController } from './controllers/fx-conversion.controller';
import { FxAdminController } from './controllers/fx-admin.controller';
import { ConfigModule } from '../config/config.module';
import { DisputesModule } from '../modules/disputes/disputes.module';
import { AdminAuditModule } from '../modules/admin-audit/admin-audit.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';

/**
 * FxModule requires:
 *  - RedisModule / IoRedisModule registered in AppModule (provides @InjectRedis())
 *  - LoyaltyModule exported so FeeCalculatorService can reference LoyaltyTier
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FxQuote, FxConversion, WalletEntity, TransactionEntity]),
    ConfigModule,
    DisputesModule,
    AdminAuditModule,
    NotificationsModule,
  ],
  controllers: [FxConversionController, FxAdminController],
  providers: [
    FxConversionService,
    FeeCalculatorService,
    RegulatoryDisclosureService,
    RateProviderService,
    FxSlaAlertCron,
  ],
  exports: [FxConversionService, FeeCalculatorService, RateProviderService],
})
export class FxConversionsModule {}
