import { Controller, Post, Get, Delete, Body, Param } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  // Assume userId is retrieved from an auth guard
  @Post('register')
  register(@Body() createDto: CreateWebhookDto) {
    const userId = 'user-123'; // Placeholder
    return this.webhooksService.create(userId, createDto);
  }

  @Get(':userId')
  getWebhooks(@Param('userId') userId: string) {
    return this.webhooksService.findByUserId(userId);
  }

  @Delete(':webhookId')
  deleteWebhook(@Param('webhookId') webhookId: string) {
    const userId = 'user-123'; // Placeholder
    return this.webhooksService.delete(webhookId, userId);
  }
}