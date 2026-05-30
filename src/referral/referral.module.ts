import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Referral } from './referral.entity';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { WalletsModule } from '../wallet/wallets.module';

@Module({
  imports: [TypeOrmModule.forFeature([Referral]), WalletsModule],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
