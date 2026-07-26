import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RateAlertHistoryService } from './rate-alert-history.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@Controller('api/v1/rate-alerts/history')
@UseGuards(JwtAuthGuard)
export class RateAlertHistoryController {
  constructor(private readonly historyService: RateAlertHistoryService) {}

  @Get()
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = request.user?.sub ?? '';
    return this.historyService.findByUserId(
      userId,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
