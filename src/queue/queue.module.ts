import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { queueConfig } from './queue.config';
import { QUEUE_NAMES } from './queue.constants';
import { QueueService } from './queue.service';
import { QueueDashboardController } from './queue-dashboard.controller';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { ReconciliationModule } from '../modules/reconciliation/reconciliation.module';
import { LedgerModule } from '../double-entry-ledger/ledger.module';
import { DeadLetterJobEntity } from './entities/dead-letter-job.entity';
import { DlqAlertingService } from './services/alerting.service';

// Processors
import { RetryJobsProcessor } from './retry-jobs.processor';
import { ReconciliationProcessor } from './reconciliation.processor';
import { FraudScoringProcessor } from './fraud-scoring.processor';
import { WebhookDispatchProcessor } from './webhook-dispatch.processor';
import { DeadLetterProcessor } from './dead-letter.processor';
import { UsersModule } from '../modules/users/users.module';

const QUEUE_DEFINITIONS = Object.values(QUEUE_NAMES).map((name) => ({ name }));

@Module({
  imports: [
    ConfigModule.forFeature(queueConfig),
    NotificationsModule,
    ReconciliationModule,
    LedgerModule,
    UsersModule,
    TypeOrmModule.forFeature([DeadLetterJobEntity]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: configService.get('queue.redis'),
        defaultJobOptions: configService.get('queue.defaultJobOptions'),
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(...QUEUE_DEFINITIONS),
  ],
  controllers: [QueueDashboardController],
  providers: [
    QueueService,
    DlqAlertingService,
    RetryJobsProcessor,
    ReconciliationProcessor,
    FraudScoringProcessor,
    WebhookDispatchProcessor,
    DeadLetterProcessor,
  ],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
