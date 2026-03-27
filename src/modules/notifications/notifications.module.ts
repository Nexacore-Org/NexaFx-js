import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';

import { NotificationThrottleEntity } from './entities/notification-throttle.entity';
import { DeviceTokenEntity } from './entities/device-token.entity';
import { NotificationDeliveryReceiptEntity } from './entities/notification-delivery-receipt.entity';
import { NotificationLogEntity } from './entities/notification-log.entity';

import { NotificationThrottleService } from './services/notification-throttle.service';
import { NotificationService } from './services/notification.service';
import { PushNotificationService } from './services/push-notification.service';
import { SmsService } from './services/sms.service';
import { NotificationOrchestratorService } from './services/notification-orchestrator.service';
import { NotificationLogService } from './services/notification-log.service';

import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { DeviceTokenController } from './controllers/device-token.controller';

import { NotificationBatchJob } from './jobs/notification-batch.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationThrottleEntity,
      DeviceTokenEntity,
      NotificationDeliveryReceiptEntity,
      NotificationLogEntity,
    ]),
    ScheduleModule.forRoot(),
    ConfigModule,
  ],
  controllers: [AdminNotificationsController, DeviceTokenController],
  providers: [
    NotificationThrottleService,
    NotificationService,
    PushNotificationService,
    SmsService,
    NotificationOrchestratorService,
    NotificationLogService,
    NotificationBatchJob,
  ],
  exports: [
    NotificationService,
    NotificationThrottleService,
    PushNotificationService,
    SmsService,
    NotificationOrchestratorService,
    NotificationLogService,
  ],
})
export class NotificationsModule {}
