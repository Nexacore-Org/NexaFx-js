import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ActivityFeedService, ActivityFeedFilters } from './activity-feed.service';
import { ActivityType } from './activity-feed-item.entity';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@Controller('api/v1/activity-feed')
export class ActivityFeedController {
  constructor(private readonly activityFeedService: ActivityFeedService) {}

  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: ActivityType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.sub ?? '';
    const filters: ActivityFeedFilters = {
      type,
      startDate,
      endDate,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };
    return this.activityFeedService.findAll(userId, filters);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markAsRead(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const userId = req.user?.sub ?? '';
    return this.activityFeedService.markAsRead(userId, id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub ?? '';
    await this.activityFeedService.markAllAsRead(userId);
    return { message: 'All activities marked as read' };
  }
}
