import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { NotificationThrottleEntity } from './entities/notification-throttle.entity';
import { DeviceTokenEntity } from './entities/device-token.entity';
import { NotificationThrottleService } from './services/notification-throttle.service';
import { NotificationService } from './services/notification.service';
import { PushNotificationService } from './services/push-notification.service';
import { NotificationOrchestratorService } from './services/notification-orchestrator.service';
import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { DeviceTokenController } from './controllers/device-token.controller';
import { NotificationBatchJob } from './jobs/notification-batch.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationThrottleEntity, DeviceTokenEntity]),
    ScheduleModule.forRoot(),
  ],
  controllers: [AdminNotificationsController, DeviceTokenController],
  providers: [
    NotificationThrottleService,
    NotificationService,
    PushNotificationService,
    NotificationOrchestratorService,
    NotificationBatchJob,
  ],
  exports: [
    NotificationService,
    NotificationThrottleService,
    PushNotificationService,
    NotificationOrchestratorService,
  ],
})
export class NotificationsModule {}
