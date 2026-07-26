import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WebhooksService } from './webhooks.service';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@Controller('api/v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

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
  ) {
    return this.webhooksService.listDeliveries(
      request.user?.sub ?? '',
      endpointId,
    );
  }
}
