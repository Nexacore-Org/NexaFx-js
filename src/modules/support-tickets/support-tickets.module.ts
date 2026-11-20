import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicketEntity } from './entities/support-ticket.entity';
import { TicketMessageEntity } from './entities/ticket-message.entity';
import { SupportTicketsService } from './services/support-tickets.service';
import { SupportTicketsController } from './controllers/support-tickets.controller';
import { AdminSupportTicketsController } from './controllers/admin-support-tickets.controller';
import { UsersModule } from '../../users/users.module';
import { MailModule } from '../../mail/mail.module';
import { SupportTicketMailListener } from './listeners/support-ticket-mail.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicketEntity, TicketMessageEntity]),
    UsersModule,
    MailModule,
  ],
  controllers: [SupportTicketsController, AdminSupportTicketsController],
  providers: [SupportTicketsService, SupportTicketMailListener],
  exports: [SupportTicketsService],
})
export class SupportTicketsModule {}
