import { Module } from '@nestjs/common';
import { ActivityFeedModule } from '../activity-feed/activity-feed.module';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  imports: [ActivityFeedModule],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
