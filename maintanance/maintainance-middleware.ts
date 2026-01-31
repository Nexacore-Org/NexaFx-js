import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MaintenanceService } from '../maintenance.service';

// Extend Express Request to include user
interface RequestWithUser extends Request {
  user?: {
    role?: string;
    roles?: string[];
    id?: string;
  };
}

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  async use(req: RequestWithUser, res: Response, next: NextFunction) {
    // Skip health check and maintenance endpoints
    const exemptPaths = [
      '/health',
      '/api/health',
      '/maintenance',
      '/api/maintenance',
    ];

    const isExempt = exemptPaths.some((path) =>
      req.path.toLowerCase().includes(path.toLowerCase()),
    );

    if (isExempt) {
      return next();
    }

    const isMaintenanceActive =
      this.maintenanceService.isMaintenanceModeActive();

    if (!isMaintenanceActive) {
      return next();
    }

    // Check if user has bypass role
    const userRole = req.user?.role || req.user?.roles?.[0];
    if (userRole && this.maintenanceService.canBypass(userRole)) {
      return next();
    }

    // Check if specific endpoint is disabled
    const isEndpointDisabled = this.maintenanceService.isEndpointDisabled(
      req.path,
    );

    // If global maintenance mode or specific endpoint is disabled
    if (isMaintenanceActive && (!req.path || isEndpointDisabled)) {
      const maintenanceResponse =
        this.maintenanceService.getMaintenanceResponse();

      throw new HttpException(
        {
          ...maintenanceResponse,
          timestamp: new Date().toISOString(),
          path: req.path,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // If maintenance is on but this specific endpoint is not disabled
    if (
      isMaintenanceActive &&
      this.maintenanceService.getMaintenanceConfig &&
      !isEndpointDisabled
    ) {
      const config = await this.maintenanceService.getMaintenanceConfig();
      // Only block if no specific endpoints are configured (global maintenance)
      if (!config.disabledEndpoints || config.disabledEndpoints.length === 0) {
        const maintenanceResponse =
          this.maintenanceService.getMaintenanceResponse();

        throw new HttpException(
          {
            ...maintenanceResponse,
            timestamp: new Date().toISOString(),
            path: req.path,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }

    next();
  }
}