import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FxAlertService, CreateAlertDto, CreateTargetOrderDto } from '../services/fx-alert.service';

@ApiTags('FX Alerts')
@ApiBearerAuth()
@Controller('fx')
export class FxAlertController {
  constructor(private readonly fxAlertService: FxAlertService) {}

  @Post('alerts')
  @ApiOperation({ summary: 'Create FX rate alert (supports recurring)' })
  createAlert(@Body() dto: CreateAlertDto & { userId: string }) {
    const { userId, ...rest } = dto;
    return this.fxAlertService.createAlert(userId, rest);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'List active alerts for user' })
  listAlerts(@Body('userId') userId: string) {
    return this.fxAlertService.listAlerts(userId);
  }

  @Get('alerts/history')
  @ApiOperation({ summary: 'Get all triggered alert history for user' })
  getHistory(@Body('userId') userId: string) {
    return this.fxAlertService.getAlertHistory(userId);
  }

  @Post('target-orders')
  @ApiOperation({ summary: 'Create price target order (auto-execute on rate reached)' })
  createTargetOrder(@Body() dto: CreateTargetOrderDto & { userId: string }) {
    const { userId, ...rest } = dto;
    return this.fxAlertService.createTargetOrder(userId, rest);
  }

  @Get('target-orders')
  @ApiOperation({ summary: 'List target orders for user' })
  listTargetOrders(@Body('userId') userId: string) {
    return this.fxAlertService.listTargetOrders(userId);
  }
}
