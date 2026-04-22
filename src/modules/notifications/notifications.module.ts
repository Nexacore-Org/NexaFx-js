import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';

import { NotificationThrottleEntity } from './entities/notification-throttle.entity';
import { DeviceTokenEntity } from './entities/device-token.entity';
import { NotificationDeliveryReceiptEntity } from './entities/notification-delivery-receipt.entity';
import { NotificationLogEntity } from './entities/notification-log.entity';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationPreferenceEntity } from './entities/notification-preference.entity';
import { NotificationTemplateEntity } from './entities/notification-template.entity';

import { NotificationThrottleService } from './services/notification-throttle.service';
import { NotificationService } from './services/notification.service';
import { PushNotificationService } from './services/push-notification.service';
import { SmsService } from './services/sms.service';
import { NotificationOrchestratorService } from './services/notification-orchestrator.service';
import { NotificationLogService } from './services/notification-log.service';
import { NotificationPersistenceService } from './services/notification-persistence.service';
import { NotificationCenterService } from './services/notification-center.service';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { TemplateService } from './services/template.service';

import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { DeviceTokenController } from './controllers/device-token.controller';
import { NotificationController } from './controllers/notification.controller';
import { NotificationPreferenceController } from './controllers/notification-preference.controller';
import { TemplateAdminController } from './controllers/template-admin.controller';

import { NotificationBatchJob } from './jobs/notification-batch.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationThrottleEntity,
      DeviceTokenEntity,
      NotificationDeliveryReceiptEntity,
      NotificationLogEntity,
      NotificationEntity,
      NotificationPreferenceEntity,
      NotificationTemplateEntity,
    ]),
    ScheduleModule.forRoot(),
    ConfigModule,
  ],
  controllers: [
    AdminNotificationsController,
    DeviceTokenController,
    NotificationController,
    NotificationPreferenceController,
    TemplateAdminController,
  ],
  providers: [
    NotificationThrottleService,
    NotificationService,
    PushNotificationService,
    SmsService,
    NotificationOrchestratorService,
    NotificationLogService,
    NotificationBatchJob,
    NotificationPersistenceService,
    NotificationCenterService,
    NotificationPreferenceService,
    TemplateService,
  ],
  exports: [
    NotificationService,
    NotificationThrottleService,
    PushNotificationService,
    SmsService,
    NotificationOrchestratorService,
    NotificationLogService,
    NotificationPersistenceService,
    NotificationCenterService,
    NotificationPreferenceService,
    TemplateService,
  ],
})
export class NotificationsModule {}
