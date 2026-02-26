import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { NotificationService } from '../services/notification.service';
import { UpdateThrottleConfigDto, CreateThrottleRuleDto } from '../dto/update-throttle-config.dto';

/**
 * Admin endpoints for managing notification throttle configurations
 * These allow runtime configuration of throttling rules without redeployment
 */
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Get all throttle configurations
   */
  @Get('throttles')
  async getAllThrottleConfigs() {
    const configs = await this.notificationService.getAllThrottleConfigs();
    return {
      success: true,
      data: configs,
      count: configs.length,
    };
  }

  /**
   * Get throttle configuration for a specific notification type
   */
  @Get('throttles/:type')
  async getThrottleConfig(@Param('type') type: string) {
    const config = await this.notificationService.getThrottleConfig(type);
    return {
      success: !!config,
      data: config,
    };
  }

  /**
   * Update throttle configuration for a notification type
   */
  @Patch('throttles/:type')
  async updateThrottleConfig(
    @Param('type') type: string,
    @Body() dto: UpdateThrottleConfigDto,
  ) {
    const updated = await this.notificationService.updateThrottleConfig(type, {
      maxBatchSize: dto.maxBatchSize,
      windowSeconds: dto.windowSeconds,
      cooldownSeconds: dto.cooldownSeconds,
      enabled: dto.enabled,
      metadata: dto.metadata,
    });

    return {
      success: true,
      data: updated,
      message: `Updated throttle configuration for ${type}`,
    };
  }

  /**
   * Create a new throttle rule for a notification type
   */
  @Post('throttles')
  async createThrottleRule(@Body() dto: CreateThrottleRuleDto) {
    const created = await this.notificationService.updateThrottleConfig(dto.notificationType, {
      maxBatchSize: dto.maxBatchSize ?? 10,
      windowSeconds: dto.windowSeconds ?? 300,
      cooldownSeconds: dto.cooldownSeconds ?? 60,
      enabled: dto.enabled ?? true,
      metadata: dto.metadata,
    });

    return {
      success: true,
      data: created,
      message: `Created throttle rule for ${dto.notificationType}`,
    };
  }

  /**
   * Get current queue status for all notification types
   */
  @Get('queue-status')
  async getQueueStatus() {
    const status = await this.notificationService.getQueueStatus();
    return {
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Manually flush all queued notifications
   */
  @Post('flush-all')
  async flushAll() {
    const flushed = await this.notificationService.flushAll();
    return {
      success: true,
      data: flushed,
      message: `Flushed ${flushed.length} notification batches`,
    };
  }

  /**
   * Manually flush a specific notification type
   */
  @Post('flush/:type')
  async flush(@Param('type') type: string) {
    const flushed = await this.notificationService.flush(type);
    return {
      success: !!flushed,
      data: flushed,
      message: flushed ? `Flushed ${flushed.notifications.length} notifications` : 'No notifications to flush',
    };
  }

  /**
   * Reset throttle state for a notification type
   */
  @Post('reset/:type')
  async reset(@Param('type') type: string) {
    await this.notificationService.reset(type);
    return {
      success: true,
      message: `Reset throttle state for ${type}`,
    };
  }
}
