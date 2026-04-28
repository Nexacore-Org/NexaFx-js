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

import { FxConversionController } from './controllers/fx-conversion.controller';
import { FxAdminController } from './controllers/fx-admin.controller';
import { ConfigModule } from '../config/config.module';
import { DisputesModule } from '../modules/disputes/disputes.module';
import { AdminAuditModule } from '../modules/admin-audit/admin-audit.module';

/**
 * FxModule requires:
 *  - RedisModule / IoRedisModule registered in AppModule (provides @InjectRedis())
 *  - LoyaltyModule exported so FeeCalculatorService can reference LoyaltyTier
 *
 * AppModule example:
 *   RedisModule.forRoot({ config: { host: process.env.REDIS_HOST, port: 6379 } })
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FxQuote, FxConversion, WalletEntity, TransactionEntity]),
    ConfigModule,
    DisputesModule,
    AdminAuditModule,
  ],
  controllers: [FxConversionController, FxAdminController],
  providers: [
    FxConversionService,
    FeeCalculatorService,
    RegulatoryDisclosureService,
    RateProviderService,
  ],
  exports: [FxConversionService, FeeCalculatorService],
})
export class FxModule {}
