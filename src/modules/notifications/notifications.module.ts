import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { NotificationThrottleEntity } from './entities/notification-throttle.entity';
import { NotificationThrottleService } from './services/notification-throttle.service';
import { NotificationService } from './services/notification.service';
import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { NotificationBatchJob } from './jobs/notification-batch.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationThrottleEntity]),
    ScheduleModule.forRoot(),
  ],
  controllers: [AdminNotificationsController],
  providers: [NotificationThrottleService, NotificationService, NotificationBatchJob],
  exports: [NotificationService, NotificationThrottleService],
})
export class NotificationsModule {}
