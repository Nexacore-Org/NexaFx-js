import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { EmitNotificationDto } from './dto/notification.dto';

// Replace these with your actual auth guards
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly gateway: NotificationsGateway,
  ) {}

  @Post('emit/user/:userId')
  @Roles('admin', 'super_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Emit a notification to a specific user (admin only)' })
  @ApiResponse({ status: 204, description: 'Notification emitted' })
  async emitToUser(
    @Param('userId') userId: string,
    @Body() dto: EmitNotificationDto,
  ): Promise<void> {
    await this.notificationsService.emitToUser(userId, dto.event, dto.payload);
  }

  @Post('emit/admin')
  @Roles('admin', 'super_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Broadcast an admin-level notification' })
  async emitToAdmins(@Body() dto: EmitNotificationDto): Promise<void> {
    await this.notificationsService.emitToAdmins(dto.event, dto.payload);
  }

  @Post('emit/transaction/:transactionId/user/:userId')
  @Roles('admin', 'super_admin', 'system')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Emit a transaction status update' })
  async emitTransactionUpdate(
    @Param('userId') userId: string,
    @Param('transactionId') transactionId: string,
    @Body() dto: EmitNotificationDto,
  ): Promise<void> {
    const status = (dto.payload.status as string) ?? 'pending';
    await this.notificationsService.emitTransactionUpdate(
      userId,
      transactionId,
      status,
      dto.payload,
    );
  }

  @Post('emit/fraud-alert/user/:userId')
  @Roles('admin', 'super_admin', 'fraud_analyst')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Emit a fraud alert for a user' })
  async emitFraudAlert(
    @Param('userId') userId: string,
    @Body() dto: EmitNotificationDto,
  ): Promise<void> {
    const alertId = dto.payload.alertId as string;
    const severity = (dto.payload.severity as 'low' | 'medium' | 'high' | 'critical') ?? 'medium';
    await this.notificationsService.emitFraudAlert(userId, alertId, severity, dto.payload);
  }

  @Get('stats')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'WebSocket connection statistics' })
  getStats() {
    return {
      onlineUsers: this.gateway.getOnlineUserCount(),
      totalConnections: this.gateway.getConnectedSocketCount(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/user/:userId')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Check if a user has an active WebSocket connection' })
  checkUserOnline(@Param('userId') userId: string) {
    return {
      userId,
      online: this.gateway.isUserOnline(userId),
      timestamp: new Date().toISOString(),
    };
  }
}
