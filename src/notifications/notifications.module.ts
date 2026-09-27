import { Module } from '@nestjs/common';
import { PushModule } from './push/push.module';
import { NotificationPreferencesModule } from '../notification-preferences/notification-preferences.module';

@Module({
  imports: [PushModule, NotificationPreferencesModule],
  exports: [PushModule],
})
export class NotificationsModule {}