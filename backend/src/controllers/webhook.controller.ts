import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ValidateSignature } from '../decorators/signature-validation.decorator';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  @Post('github')
  @ValidateSignature()
  async handleGitHubWebhook(@Body() payload: any) {
    this.logger.log('Received valid GitHub webhook');

    // Process webhook payload

    return { success: true };
}

@Post('stripe')
@ValidateSignature()
async handleStripeWebhook(@Body() payload: any) {
  this.logger.log('Received valid Stripe webhook');
  // Process webhook payload
  return { success: true };
}
}