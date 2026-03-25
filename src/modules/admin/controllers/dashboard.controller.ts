import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { DashboardService } from '../services/dashboard.service';

@Controller('admin/dashboard')
@UseGuards(AdminGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getDashboard() {
    return this.dashboardService.getDashboard();
  }

  @Get('alerts')
  getActiveAlerts() {
    return this.dashboardService.getActiveAlerts();
  }
}
