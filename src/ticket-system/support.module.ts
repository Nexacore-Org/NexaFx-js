import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { SupportController } from './support.controller';
import { AdminSupportController } from './admin-support.service';
import { SupportAnalyticsController } from './controllers/support-analytics.controller';
import { SupportService } from './support.service';
import { SupportTicket } from './entities/support-ticket.entity';
import { SupportMessage } from './entities/support-message.entity';
import { SlaMonitorJob } from './jobs/sla-monitor.job';
import { TicketNotificationListener } from './listeners/ticket-notification.listener';
import { NotificationsModule } from '../web-sockets/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket, SupportMessage]),
    ScheduleModule.forRoot(),
    NotificationsModule,
  ],
  controllers: [SupportController, AdminSupportController, SupportAnalyticsController],
  providers: [SupportService, SlaMonitorJob, TicketNotificationListener],
  exports: [SupportService],
})
export class SupportModule {}
