import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicketEntity } from './entities/support-ticket.entity';
import { TicketMessageEntity } from './entities/ticket-message.entity';
import { SupportTicketsService } from './services/support-tickets.service';
import { SupportTicketsController } from './controllers/support-tickets.controller';
import { AdminSupportTicketsController } from './controllers/admin-support-tickets.controller';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicketEntity, TicketMessageEntity]),
    UsersModule,
  ],
  controllers: [SupportTicketsController, AdminSupportTicketsController],
  providers: [SupportTicketsService],
  exports: [SupportTicketsService],
})
export class SupportTicketsModule {}
