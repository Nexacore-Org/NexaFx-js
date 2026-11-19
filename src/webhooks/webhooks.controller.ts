import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WebhooksService } from './webhooks.service';
import { WebhookRetryJob } from './webhook-retry.job';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto';
import {
  CreateWebhookEndpointRequestDto,
  CreateWebhookEndpointResponseDto,
  UpdateWebhookEndpointRequestDto,
  WebhookEndpointResponseDto,
} from './dto/webhook-endpoint.dto';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@ApiTags('Webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly webhookRetryJob: WebhookRetryJob,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('endpoints')
  @ApiOperation({ summary: 'Create a webhook endpoint (secret shown once)' })
  @ApiOkResponse({ type: CreateWebhookEndpointResponseDto })
  async create(
    @Body() body: CreateWebhookEndpointRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CreateWebhookEndpointResponseDto> {
    const { endpoint, secret } = await this.webhooksService.createEndpoint({
      ownerId: request.user?.sub ?? '',
      url: body.url,
      events: body.events,
    });
    return { ...endpoint, secret };
  }

  @UseGuards(JwtAuthGuard)
  @Get('endpoints')
  @ApiOperation({ summary: 'List webhook endpoints (never returns secrets)' })
  @ApiOkResponse({ type: [WebhookEndpointResponseDto] })
  list(@Req() request: AuthenticatedRequest) {
    return this.webhooksService.listEndpoints(request.user?.sub ?? '');
  }

  @UseGuards(JwtAuthGuard)
  @Get('endpoints/:id')
  @ApiOperation({ summary: 'Get a webhook endpoint (never returns the secret)' })
  @ApiOkResponse({ type: WebhookEndpointResponseDto })
  getEndpoint(
    @Param('id') endpointId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webhooksService.getEndpoint(request.user?.sub ?? '', endpointId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('endpoints/:id')
  @ApiOperation({ summary: 'Update a webhook endpoint URL or events' })
  @ApiOkResponse({ type: WebhookEndpointResponseDto })
  updateEndpoint(
    @Param('id') endpointId: string,
    @Body() body: UpdateWebhookEndpointRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webhooksService.updateEndpoint(
      request.user?.sub ?? '',
      endpointId,
      body,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('endpoints/:id/deliveries')
  listDeliveries(
    @Param('id') endpointId: string,
    @Req() request: AuthenticatedRequest,
    @Query() query: ListDeliveriesQueryDto,
  ) {
    return this.webhooksService.listDeliveries(
      request.user?.sub ?? '',
      endpointId,
      query,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('deliveries/:id')
  getDelivery(
    @Param('id') deliveryId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webhooksService.findDeliveryForOwner(
      deliveryId,
      request.user?.sub ?? '',
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('deliveries/:id/retry')
  async retryDelivery(@Param('id') deliveryId: string) {
    return this.webhookRetryJob.manualRetry(deliveryId);
  }
}
