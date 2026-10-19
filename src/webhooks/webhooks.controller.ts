import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WebhooksService } from './webhooks.service';
import { WebhookRetryJob } from './webhook-retry.job';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly webhookRetryJob: WebhookRetryJob,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('endpoints')
  create(
    @Body()
    body: {
      url: string;
      secret: string;
      events: string[];
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webhooksService.createEndpoint({
      ownerId: request.user?.sub ?? '',
      url: body.url,
      secret: body.secret,
      events: body.events,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('endpoints')
  list(@Req() request: AuthenticatedRequest) {
    return this.webhooksService.listEndpoints(request.user?.sub ?? '');
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
