import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { queueConfig } from './queue.config';
import { QUEUE_NAMES } from './queue.constants';
import { QueueService } from './queue.service';
import { QueueDashboardController } from './queue-dashboard.controller';

// Processors
import { RetryJobsProcessor } from './processors/retry-jobs.processor';
import { ReconciliationProcessor } from './processors/reconciliation.processor';
import { FraudScoringProcessor } from './processors/fraud-scoring.processor';
import { WebhookDispatchProcessor } from './processors/webhook-dispatch.processor';
import { DeadLetterProcessor } from './processors/dead-letter.processor';

const QUEUE_DEFINITIONS = Object.values(QUEUE_NAMES).map((name) => ({
  name,
}));

@Module({
  imports: [
    ConfigModule.forFeature(queueConfig),
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
    RetryJobsProcessor,
    ReconciliationProcessor,
    FraudScoringProcessor,
    WebhookDispatchProcessor,
    DeadLetterProcessor,
  ],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
