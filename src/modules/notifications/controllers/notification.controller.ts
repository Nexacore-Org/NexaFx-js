import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  DefaultValuePipe,
} from '@nestjs/common';
import { NotificationPersistenceService } from '../services/notification-persistence.service';
import { NotificationCenterService } from '../services/notification-center.service';

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly persistenceService: NotificationPersistenceService,
    private readonly centerService: NotificationCenterService,
  ) {}

  @Get()
  async list(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    const { items, total, unreadCount } = await this.persistenceService.findPaginated(
      userId,
      page,
      Math.min(limit, 100),
    );

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  @Post(':id/read')
  async markRead(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const notification = await this.persistenceService.markRead(id, userId);
    const unreadCount = await this.persistenceService.getUnreadCount(userId);
    await this.centerService.emitBadgeCount(userId, unreadCount);
    return { data: notification, unreadCount };
  }

  @Post('read-all')
  async markAllRead(@Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const result = await this.persistenceService.markAllRead(userId);
    await this.centerService.emitBadgeCount(userId, 0);
    return { ...result, unreadCount: 0 };
  }
}
