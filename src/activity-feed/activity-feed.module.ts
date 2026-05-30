import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityFeedController } from './activity-feed.controller';
import { ActivityEvent } from './activity-event.entity';
import { ActivityFeedService } from './activity-feed.service';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityEvent])],
  controllers: [ActivityFeedController],
  providers: [ActivityFeedService],
  exports: [ActivityFeedService],
})
export class ActivityFeedModule {}
