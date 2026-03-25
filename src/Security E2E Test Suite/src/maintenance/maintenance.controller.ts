import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MaintenanceService } from './maintenance.service';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  /** Public — anyone can check maintenance status */
  @Get('status')
  getStatus() {
    return this.maintenanceService.getStatus();
  }

  /**
   * Protected — only admin or superadmin may change maintenance config.
   * @Roles guard was previously commented out; restored here (issue #2).
   */
  @Put('config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  updateConfig(@Body() config: any) {
    return this.maintenanceService.updateConfig(config);
  }
}
