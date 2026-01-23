import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Post()
  create(@Body() dto: CreateWebhookDto) {
    return this.service.create(dto);
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWebhookDto) {
    return this.service.update(id, dto);
  }
}
