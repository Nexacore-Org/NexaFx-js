import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksProcessor } from './webhooks.processor';
import { WebhooksListener } from './webhooks.listener';
import { WebhookEndpoint } from './webhook-endpoint.entity';
import { WebhookDelivery } from './webhook-delivery.entity';
import { AuthModule } from '../auth/auth.module';
import { WebhookRetryJob } from './webhook-retry.job';
import { WebhookDeliveryRetentionJob } from './webhook-delivery-retention.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEndpoint, WebhookDelivery]),
    HttpModule,
    BullModule.registerQueue({ name: 'webhooks' }),
    AuthModule,
  ],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhooksProcessor,
    WebhooksListener,
    WebhookRetryJob,
    WebhookDeliveryRetentionJob,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
