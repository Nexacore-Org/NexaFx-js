import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralEntity } from './entities/referral.entity';
import { ReferralRewardEntity } from './entities/referral-reward.entity';
import { ReferralService } from './services/referral.service';
import { ReferralController } from './controllers/referral.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReferralEntity, ReferralRewardEntity])],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralsModule {}
