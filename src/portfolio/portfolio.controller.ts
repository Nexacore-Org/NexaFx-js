import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  PortfolioService,
  RebalancingRequest,
} from './portfolio.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@Controller('api/v1/portfolio')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post('rebalance')
  rebalance(
    @Body() dto: Omit<RebalancingRequest, 'userId'>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.portfolioService.computeRebalancing({
      ...dto,
      userId: request.user?.sub ?? '',
    });
  }

  @Get('rebalance')
  getHistory(@Req() request: AuthenticatedRequest) {
    return this.portfolioService.getHistory(request.user?.sub ?? '');
  }
}
