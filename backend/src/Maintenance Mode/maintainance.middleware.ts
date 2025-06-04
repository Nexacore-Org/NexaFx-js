import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MaintenanceService } from './maintenance.service';

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Skip middleware for maintenance routes themselves
    if (req.path.startsWith('/maintenance')) {
      return next();
    }

    if (
      this.maintenanceService.getMaintenanceStatus() &&
      !this.maintenanceService.isIPWhitelisted(req.ip)
    ) {
      return res.status(503).json({
        status: 'error',
        message: 'Service is currently under maintenance',
      });
    }

    next();
  }
}