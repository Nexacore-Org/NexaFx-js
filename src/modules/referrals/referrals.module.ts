import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralEntity } from './entities/referral.entity';
import { ReferralRewardEntity } from './entities/referral-reward.entity';
import { ReferralService } from './services/referral.service';
import { ReferralFraudService } from './services/referral-fraud.service';
import { ReferralController } from './controllers/referral.controller';
import { ReferralAdminController } from './controllers/referral-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReferralEntity, ReferralRewardEntity])],
  controllers: [ReferralController, ReferralAdminController],
  providers: [ReferralService, ReferralFraudService],
  exports: [ReferralService],
})
export class ReferralsModule {}
