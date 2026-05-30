import { Module } from '@nestjs/common';
import { ActivityFeedModule } from '../activity-feed/activity-feed.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { WalletBalanceEntity } from './wallet-balance.entity';

@Module({
  imports: [ActivityFeedModule],
  imports: [TypeOrmModule.forFeature([WalletBalanceEntity])],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
