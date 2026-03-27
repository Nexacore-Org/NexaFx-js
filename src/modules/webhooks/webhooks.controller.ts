import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhooksService } from './webhooks.service';
import { AuditLog } from '../admin-audit/decorators/audit-log.decorator';
import { SkipAudit } from '../admin-audit/decorators/skip-audit.decorator';
import { WebhookSandboxService } from './sandbox/webhook-sandbox.service';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { randomBytes } from 'crypto';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly service: WebhooksService,
    private readonly sandboxService: WebhookSandboxService,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

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

  @Post('sandbox/:eventType')
  @SkipAudit()
  sendSandboxEvent(@Param('eventType') eventType: string) {
    return this.sandboxService.sendTestEvent(eventType);
  }

  @Post('deliveries/:id/replay')
  @SkipAudit()
  replay(@Param('id') id: string) {
    return this.dispatcher.replay(id);
  }

  @Post('test')
  @SkipAudit()
  async testWebhook(
    @Body() body: { url: string; eventName: string; payload?: Record<string, any>; secret?: string },
  ) {
    const payload = body.payload ?? { test: true, timestamp: new Date().toISOString() };
    const secret = body.secret ?? randomBytes(16).toString('hex');
    return this.dispatcher.testSend(body.url, body.eventName ?? 'test.ping', payload, secret);
  }
}

@Controller('admin/webhooks')
export class AdminWebhooksController {
  constructor(private readonly dispatcher: WebhookDispatcherService) {}

  @Get('deliveries')
  @SkipAudit()
  getDeliveries(
    @Query('status') status?: string,
    @Query('eventName') eventName?: string,
    @Query('subscriptionId') subscriptionId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.dispatcher.getDeliveryDashboard({
      status,
      eventName,
      subscriptionId,
      dateFrom,
      dateTo,
      page,
      limit,
    });
  }
}
