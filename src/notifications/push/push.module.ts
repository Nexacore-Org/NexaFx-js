import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { DeviceToken } from '../device-token.entity';
import { PushNotificationService } from './push.service';
import { DevicesController } from '../devices.controller';
import { NotificationBatchingService } from '../notification-batching.service';
import { NotificationListener } from '../notification.listener';
import { NotificationPreference } from '../../notification-preferences/notification-preference.entity';
import { FcmV1Provider } from './fcm-v1.provider';
import { ApnsProvider } from './apns.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceToken, NotificationPreference]),
    HttpModule,
  ],
  controllers: [DevicesController],
  providers: [
    PushNotificationService,
    FcmV1Provider,
    ApnsProvider,
    NotificationBatchingService,
    NotificationListener,
  ],
  exports: [
    PushNotificationService,
    FcmV1Provider,
    ApnsProvider,
    NotificationBatchingService,
  ],
})
export class PushModule {}
