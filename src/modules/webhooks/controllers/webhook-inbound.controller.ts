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

@Controller('webhooks/inbound')
export class WebhookInboundController {
  private readonly logger = new Logger(WebhookInboundController.name);

  @Post()
  @HttpCode(200)
  @UseGuards(WebhookSignatureGuard)
  @SkipAudit()
  receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-nexafx-event') eventName: string,
    @Headers('x-nexafx-delivery-id') deliveryId: string,
    @Body() payload: Record<string, any>,
  ) {
    this.logger.log(
      `Verified inbound webhook received: event=${eventName} deliveryId=${deliveryId}`,
    );

    return { received: true };
  }
}
