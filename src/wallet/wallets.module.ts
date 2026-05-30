import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityFeedModule } from '../activity-feed/activity-feed.module';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { WalletBalanceEntity } from './wallet-balance.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WalletBalanceEntity]),
    ActivityFeedModule,
  ],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
