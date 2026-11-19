import {
  Controller,
  Get,
  Patch,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ActivityFeedService } from './activity-feed.service';
import { ListActivityQueryDto } from './dto/list-activity-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('activity-feed')
export class ActivityFeedController {
  constructor(private readonly activityFeedService: ActivityFeedService) {}

  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query(ValidationPipe) dto: ListActivityQueryDto,
  ) {
    const userId = req.user?.sub ?? '';
    return this.activityFeedService.findAll(userId, {
      type: dto.type,
      startDate: dto.startDate,
      endDate: dto.endDate,
      page: dto.page,
      limit: dto.limit,
    });
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markAsRead(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
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
