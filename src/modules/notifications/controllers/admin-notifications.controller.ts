import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { NotificationService } from '../services/notification.service';
import { NotificationLogService } from '../services/notification-log.service';
import { UpdateThrottleConfigDto, CreateThrottleRuleDto } from '../dto/update-throttle-config.dto';
import { NotificationLogStatus } from '../entities/notification-log.entity';

/**
 * Admin endpoints for managing notification throttle configurations,
 * viewing notification history, analytics, and per-user notifications.
 */
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationLogService: NotificationLogService,
  ) {}

  // ─── Throttle management ──────────────────────────────────────────────────

  @Get('throttles')
  async getAllThrottleConfigs() {
    const configs = await this.notificationService.getAllThrottleConfigs();
    return { success: true, data: configs, count: configs.length };
  }

  @Get('throttles/:type')
  async getThrottleConfig(@Param('type') type: string) {
    const config = await this.notificationService.getThrottleConfig(type);
    return { success: !!config, data: config };
  }

  @Patch('throttles/:type')
  async updateThrottleConfig(@Param('type') type: string, @Body() dto: UpdateThrottleConfigDto) {
    const updated = await this.notificationService.updateThrottleConfig(type, {
      maxBatchSize: dto.maxBatchSize,
      windowSeconds: dto.windowSeconds,
      cooldownSeconds: dto.cooldownSeconds,
      enabled: dto.enabled,
      metadata: dto.metadata,
    });
    return { success: true, data: updated, message: `Updated throttle configuration for ${type}` };
  }

  @Post('throttles')
  async createThrottleRule(@Body() dto: CreateThrottleRuleDto) {
    const created = await this.notificationService.updateThrottleConfig(dto.notificationType, {
      maxBatchSize: dto.maxBatchSize ?? 10,
      windowSeconds: dto.windowSeconds ?? 300,
      cooldownSeconds: dto.cooldownSeconds ?? 60,
      enabled: dto.enabled ?? true,
      metadata: dto.metadata,
    });
    return { success: true, data: created, message: `Created throttle rule for ${dto.notificationType}` };
  }

  @Get('queue-status')
  async getQueueStatus() {
    const status = await this.notificationService.getQueueStatus();
    return { success: true, data: status, timestamp: new Date().toISOString() };
  }

  @Post('flush-all')
  async flushAll() {
    const flushed = await this.notificationService.flushAll();
    return { success: true, data: flushed, message: `Flushed ${flushed.length} notification batches` };
  }

  @Post('flush/:type')
  async flush(@Param('type') type: string) {
    const flushed = await this.notificationService.flush(type);
    return {
      success: !!flushed,
      data: flushed,
      message: flushed ? `Flushed ${flushed.notifications.length} notifications` : 'No notifications to flush',
    };
  }

  @Post('reset/:type')
  async reset(@Param('type') type: string) {
    await this.notificationService.reset(type);
    return { success: true, message: `Reset throttle state for ${type}` };
  }

  // ─── History & analytics ──────────────────────────────────────────────────

  @Get('history')
  async getHistory(
    @Query('userId') userId?: string,
    @Query('type') notificationType?: string,
    @Query('channel') channel?: string,
    @Query('status') status?: NotificationLogStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const { logs, total } = await this.notificationLogService.getHistory({
      userId,
      notificationType,
      channel,
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    return { success: true, data: logs, total };
  }

  @Get('analytics')
  async getAnalytics() {
    const analytics = await this.notificationLogService.getAnalytics();
    return { success: true, data: analytics, timestamp: new Date().toISOString() };
  }

  @Get('users/:id/notifications')
  async getUserNotifications(@Param('id') userId: string) {
    const logs = await this.notificationLogService.getUserNotifications(userId);
    return { success: true, data: logs, total: logs.length };
  }
}
