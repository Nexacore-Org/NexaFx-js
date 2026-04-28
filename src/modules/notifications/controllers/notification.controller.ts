import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Delete,
  Query,
  Request,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NotificationPersistenceService } from '../services/notification-persistence.service';
import { NotificationCenterService } from '../services/notification-center.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly persistenceService: NotificationPersistenceService,
    private readonly centerService: NotificationCenterService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated list of notifications with unreadCount in meta' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
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
  @ApiOperation({ summary: 'Mark notification as read and emit updated badge count via WebSocket' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markRead(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const notification = await this.persistenceService.markRead(id, userId);
    const unreadCount = await this.persistenceService.getUnreadCount(userId);
    await this.centerService.emitBadgeCount(userId, unreadCount);
    return { data: notification, unreadCount };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read in a single operation' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllRead(@Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const result = await this.persistenceService.markAllRead(userId);
    await this.centerService.emitBadgeCount(userId, 0);
    return { ...result, unreadCount: 0 };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a notification' })
  @ApiResponse({ status: 204, description: 'Notification deleted' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async deleteNotification(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    await this.persistenceService.softDelete(id, userId);
    const unreadCount = await this.persistenceService.getUnreadCount(userId);
    await this.centerService.emitBadgeCount(userId, unreadCount);
  }
}
