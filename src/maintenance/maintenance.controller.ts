import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('maintenance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  // 🔒 ADMIN ONLY
  @Get('config')
  @Roles('admin', 'superadmin')
  getConfig() {
    return {
      success: true,
      data: this.service.getConfig(),
    };
  }

  // 🔒 ADMIN ONLY
  @Put('config')
  @Roles('admin', 'superadmin')
  updateConfig(
    @Body()
    body: {
      enabled?: boolean;
      message?: string;
    },
  ) {
    return {
      success: true,
      data: this.service.updateConfig(body),
    };
  }
}