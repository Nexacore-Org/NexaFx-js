import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { LoyaltyAccount } from './loyalty-account.entity';
import { LoyaltyTransaction } from './loyalty-transaction.entity';
import { LoyaltyBalanceSnapshot } from './entities/loyalty-balance-snapshot.entity';

import { LoyaltyService } from './loyalty.service';
import { EarnRulesService } from './earn-rules.service';

import { LoyaltyController } from './loyalty.controller';
import { LoyaltyAdminController } from './controllers/loyalty-admin.controller';
import { PointsExpiryJob } from './points-expiry.job';
import { TierChangedListener } from './tier-changed.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([LoyaltyAccount, LoyaltyTransaction, LoyaltyBalanceSnapshot]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
  ],
  controllers: [LoyaltyController, LoyaltyAdminController],
  providers: [
    LoyaltyService,
    EarnRulesService,
    PointsExpiryJob,
    TierChangedListener,
  ],
  exports: [LoyaltyService, EarnRulesService],
})
export class LoyaltyModule {}
