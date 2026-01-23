import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

import { WebhookSubscriptionEntity } from './entities/webhook-subscription.entity';
import { WebhookDeliveryEntity } from './entities/webhook-delivery.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookSubscriptionEntity, WebhookDeliveryEntity])],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDispatcherService],
  exports: [WebhookDispatcherService],
})
export class WebhooksModule {}
