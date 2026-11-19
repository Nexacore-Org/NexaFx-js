import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Referral } from './referral.entity';
import { ReferralCode } from './referral-code.entity';
import { ReferralReward } from './referral-reward.entity';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { WalletsModule } from '../wallet/wallets.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Referral, ReferralCode, ReferralReward]),
    WalletsModule,
    UsersModule,
  ],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
