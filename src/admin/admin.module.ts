import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminCacheInvalidationService } from './admin-cache-invalidation.service';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { KycDocument } from '../kyc/kyc-document.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import { WebhookEndpoint } from '../webhooks/webhook-endpoint.entity';
import { AmlAlert } from '../aml/aml-alert.entity';
import { SecurityModule } from '../common/security.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Transaction,
      KycDocument,
      SupportTicket,
      WebhookEndpoint,
      AmlAlert,
    ]),
    SecurityModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminCacheInvalidationService],
  exports: [AdminService],
})
export class AdminModule {}
