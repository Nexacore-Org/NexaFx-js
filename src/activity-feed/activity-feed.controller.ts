import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ActivityFeedService } from './activity-feed.service';

type ActivityRequestUser = {
  id?: string;
  sub?: string;
  userId?: string;
};

type ActivityRequest = {
  user?: ActivityRequestUser;
};

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsedValue = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsedValue) ? fallback : parsedValue;
};

@Controller('api/v1/users/me/activity')
export class ActivityFeedController {
  constructor(private readonly activityFeedService: ActivityFeedService) {}

  @Get()
  async getMyActivity(
    @Req() request: ActivityRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId =
      request.user?.id ?? request.user?.sub ?? request.user?.userId ?? '';

    if (!userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    return this.activityFeedService.getActivityForUser(
      userId,
      parsePositiveInteger(page, 1),
      parsePositiveInteger(limit, 20),
    );
  }
}
