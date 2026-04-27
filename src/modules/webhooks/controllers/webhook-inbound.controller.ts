import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookSignatureGuard } from '../guards/webhook-signature.guard';
import { SkipAudit } from '../../admin-audit/decorators/skip-audit.decorator';
import { InboundWebhookRouterService } from '../services/inbound-webhook-router.service';

@Controller('webhooks/inbound')
export class WebhookInboundController {
  private readonly logger = new Logger(WebhookInboundController.name);

  constructor(
    private readonly webhookRouter: InboundWebhookRouterService,
  ) {}

  @Post()
  @HttpCode(200)
  @UseGuards(WebhookSignatureGuard)
  @SkipAudit()
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-nexafx-event') eventName: string,
    @Headers('x-nexafx-delivery-id') deliveryId: string,
    @Body() payload: Record<string, any>,
  ) {
    this.logger.log(
      `Verified inbound webhook received: event=${eventName} deliveryId=${deliveryId}`,
    );

    // Route the event to the appropriate handler
    await this.webhookRouter.routeEvent(eventName, deliveryId, payload);

    return { received: true };
  }
}
