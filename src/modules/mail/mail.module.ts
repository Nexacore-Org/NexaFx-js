import { Module, forwardRef } from '@nestjs/common';
import { MailService } from './services/mail.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
