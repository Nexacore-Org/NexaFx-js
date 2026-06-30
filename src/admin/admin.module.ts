import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminCacheInvalidationService } from './admin-cache-invalidation.service';
import { AdminAlertService } from './admin-alert.service';
import { KeyRotationService } from './key-rotation.service';
import { AdminExportsController } from './exports/admin-exports.controller';
import { AdminExportsProcessor } from './exports/admin-exports.processor';
import { ExportStorageService } from './exports/export-storage.service';
import { SystemAdminController } from '../modules/admin/controllers/system-admin.controller';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { KycDocument } from '../kyc/kyc-document.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import { WebhookEndpoint } from '../webhooks/webhook-endpoint.entity';
import { AmlAlert } from '../aml/aml-alert.entity';
import { WalletBalanceEntity } from '../wallet/wallet-balance.entity';
import { SecurityModule } from '../common/security.module';
import { EncryptionModule } from '../common/encryption/encryption.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { SharedJwtModule } from '../common/jwt/jwt.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Transaction,
      KycDocument,
      SupportTicket,
      WebhookEndpoint,
      AmlAlert,
      WalletBalanceEntity,
    ]),
    BullModule.registerQueue({ name: 'admin-exports' }),
    SecurityModule,
    EncryptionModule,
    HttpModule,
    AuditModule,
    MailModule,
    SharedJwtModule,
  ],
  controllers: [AdminController, SystemAdminController, AdminExportsController],
  providers: [
    AdminService,
    AdminCacheInvalidationService,
    AdminAlertService,
    KeyRotationService,
    AdminExportsProcessor,
    ExportStorageService,
  ],
  exports: [AdminService],
})
export class AdminModule {}
