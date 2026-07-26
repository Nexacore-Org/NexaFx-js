import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { PerUserRateLimitService } from '../services/per-user-rate-limit.service';

@ApiTags('Rate Limits')
@ApiBearerAuth('access-token')
@Controller('rate-limits')
@UseGuards(JwtAuthGuard)
export class RateLimitUsageController {
  constructor(
    private readonly perUserRateLimitService: PerUserRateLimitService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Check current rate limit usage for the authenticated user' })
  @ApiQuery({ name: 'endpoint', required: false, description: 'Endpoint to check (defaults to /)' })
  @ApiOkResponse({ description: 'Current rate limit usage' })
  async getUsage(@Request() req: any, @Query('endpoint') endpoint?: string) {
    const userId = req.user?.id || req.user?.userId;
    const targetEndpoint = endpoint || '/';

    const usage = await this.perUserRateLimitService.getUsage(
      userId,
      targetEndpoint,
    );

    return {
      success: true,
      data: {
        userId,
        endpoint: targetEndpoint,
        requestCount: usage.requestCount,
        limit: usage.limit,
        remaining: Math.max(0, usage.limit - usage.requestCount),
        resetAt: usage.resetAt,
      },
    };
  }
}
