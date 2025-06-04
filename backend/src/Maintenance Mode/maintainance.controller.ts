import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { MaintenanceService } from './maintenance.service';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post('toggle')
  toggleMaintenanceMode() {
    return this.maintenanceService.toggleMaintenanceMode();
  }

  @Get('status')
  getMaintenanceStatus() {
    return { maintenanceMode: this.maintenanceService.getMaintenanceStatus() };
  }

  @Get('whitelist')
  getWhitelistedIPs() {
    return { whitelistedIPs: this.maintenanceService.getWhitelistedIPs() };
  }

  @Post('whitelist/add')
  addWhitelistedIP(@Req() req: Request) {
    const { ip } = req.body;
    if (!ip) {
      return { status: 'error', message: 'IP address is required' };
    }
    this.maintenanceService.addWhitelistedIP(ip);
    return { status: 'success' };
  }

  @Post('whitelist/remove')
  removeWhitelistedIP(@Req() req: Request) {
    const { ip } = req.body;
    if (!ip) {
      return { status: 'error', message: 'IP address is required' };
    }
    this.maintenanceService.removeWhitelistedIP(ip);
    return { status: 'success' };
  }

  // This endpoint is just for testing the maintenance mode
  @Get('test')
  testMaintenanceMode(@Req() req: Request, @Res() res: Response) {
    if (
      this.maintenanceService.getMaintenanceStatus() &&
      !this.maintenanceService.isIPWhitelisted(req.ip)
    ) {
      return res.status(503).json({
        status: 'error',
        message: 'Service is currently under maintenance',
      });
    }
    return res.json({ status: 'success', message: 'Service is operational' });
  }
}