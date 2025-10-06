import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { DisputeController } from './controllers/dispute.controller';
import { DisputeService } from './services/dispute.service';
import { S3Service } from './services/s3.service';
import { FraudDetectionService } from './services/fraud-detection.service';
import { SlaMonitorService } from './services/sla-monitor.service';
import { EmailService } from './services/email.service';
import { SmsService } from './services/sms.service';
import { PushNotificationService } from './services/push-notification.service';
import { NotificationService } from './services/notification.service';
import { SchedulerService } from './services/scheduler.service';
import { TimelineEntryService } from './services/timeline-entry.service';
import { DisputeProcessor } from './processors/dispute.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { OcrProcessor } from './processors/ocr.processor';

// Entities
import { User } from './entities/user.entity';
import { Transaction } from './entities/transaction.entity';
import { Dispute } from './entities/dispute.entity';
import { Evidence } from './entities/evidence.entity';
import { Comment } from './entities/comment.entity';
import { TimelineEntry } from './entities/timeline-entry.entity';
import { AuditLog } from './entities/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Transaction,
      Dispute,
      Evidence,
      Comment,
      TimelineEntry,
      AuditLog,
    ]),
    BullModule.registerQueue(
      { name: 'dispute' },
      { name: 'notification' },
      { name: 'ocr' },
    ),
    ScheduleModule.forRoot(),
    ConfigModule,
  ],
  controllers: [DisputeController],
  providers: [
    DisputeService,
    S3Service,
    FraudDetectionService,
    SlaMonitorService,
    EmailService,
    SmsService,
    PushNotificationService,
    NotificationService,
    SchedulerService,
    TimelineEntryService,
    DisputeProcessor,
    NotificationProcessor,
    OcrProcessor,
  ],
  exports: [DisputeService, TimelineEntryService],
})
export class DisputeModule {}
