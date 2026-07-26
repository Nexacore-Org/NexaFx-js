import { Body, Controller, Get, Param, Patch, Post, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhooksService } from './webhooks.service';
import { AuditLog } from '../admin-audit/decorators/audit-log.decorator';
import { SkipAudit } from '../admin-audit/decorators/skip-audit.decorator';
import { WebhookSandboxService } from './sandbox/webhook-sandbox.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@ApiTags('Webhooks')
@ApiBearerAuth('access-token')
@Controller('webhooks')
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(
    private readonly service: WebhooksService,
    private readonly sandboxService: WebhookSandboxService,
  ) {}

  @Post()
  @AuditLog({
    action: 'CREATE_WEBHOOK',
    entity: 'Webhook',
    description: 'Created a new webhook',
    maskFields: ['secret', 'signingSecret'],
  })
  @ApiOperation({ summary: 'Register a new webhook subscription' })
  @ApiOkResponse({ description: 'Webhook created successfully' })
  create(@Body() dto: CreateWebhookDto, @Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.service.create(dto, userId);
  }

  @Get()
  @SkipAudit()
  @ApiOperation({ summary: 'List webhook subscriptions' })
  @ApiOkResponse({ description: 'List of webhook subscriptions' })
  list(@Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.service.list(userId);
  }

  @Patch(':id/toggle')
  @AuditLog({
    action: 'TOGGLE_WEBHOOK',
    entity: 'Webhook',
    entityIdParam: 'id',
    description: 'Toggled webhook active status',
  })
  @ApiOperation({ summary: 'Toggle webhook active status' })
  @ApiOkResponse({ description: 'Webhook toggled successfully' })
  toggle(@Param('id') id: string) {
    return this.service.toggle(id);
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
}
