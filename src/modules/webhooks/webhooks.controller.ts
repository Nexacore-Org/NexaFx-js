import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhooksService } from './webhooks.service';
import { AuditLog } from '../admin-audit/decorators/audit-log.decorator';
import { SkipAudit } from '../admin-audit/decorators/skip-audit.decorator';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Post()
  @AuditLog({
    action: 'CREATE_WEBHOOK',
    entity: 'Webhook',
    description: 'Created a new webhook',
    maskFields: ['secret', 'signingSecret'],
  })
  create(@Body() dto: CreateWebhookDto) {
    return this.service.create(dto);
  }

  @Get()
  @SkipAudit()
  list() {
    return this.service.list();
  }

  @Patch(':id')
  @AuditLog({
    action: 'UPDATE_WEBHOOK',
    entity: 'Webhook',
    entityIdParam: 'id',
    description: 'Updated a webhook configuration',
    maskFields: ['secret', 'signingSecret'],
  })
  update(@Param('id') id: string, @Body() dto: UpdateWebhookDto) {
    return this.service.update(id, dto);
  }
}
