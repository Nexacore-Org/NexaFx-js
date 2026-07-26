import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WebhooksController, AdminWebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookFilterService } from './services/webhook-filter.service';
import { TransactionWebhookListener } from './listeners/transaction-webhook.listener';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeveloperPortalController } from './controllers/developer-portal.controller';
import { WebhookSandboxService } from './sandbox/webhook-sandbox.service';

import { WebhookSubscriptionEntity } from './entities/webhook-subscription.entity';
import { WebhookDeliveryEntity } from './entities/webhook-delivery.entity';
import { WebhookInboundLogEntity } from './entities/webhook-inbound-log.entity';
import { WebhookVerificationService } from './services/webhook-verification.service';
import { WebhookInboundController } from './controllers/webhook-inbound.controller';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';
import { WebhookRetryJob } from './webhook-retry.job';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebhookSubscriptionEntity,
      WebhookDeliveryEntity,
      WebhookInboundLogEntity,
    ]),
    NotificationsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [WebhooksController, AdminWebhooksController, DeveloperPortalController, WebhookInboundController],
  providers: [
    WebhooksService,
    WebhookDispatcherService,
    TransactionWebhookListener,
    WebhookSandboxService,
    WebhookVerificationService,
    WebhookSignatureGuard,
    WebhookFilterService,
    WebhookRetryJob,
  ],
  exports: [WebhookDispatcherService, WebhooksService, WebhookRetryJob],
})
export class WebhooksModule {}
