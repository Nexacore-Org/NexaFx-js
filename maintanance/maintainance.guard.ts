import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MaintenanceService } from '../maintenance.service';
import { BYPASS_MAINTENANCE_KEY } from '../decorators/bypass-maintenance.decorator';

interface RequestWithUser {
  user?: {
    role?: string;
    roles?: string[];
  };
  path: string;
}

@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly maintenanceService: MaintenanceService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route has @BypassMaintenance decorator
    const bypassMaintenance = this.reflector.getAllAndOverride<boolean>(
      BYPASS_MAINTENANCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (bypassMaintenance) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const isMaintenanceActive =
      this.maintenanceService.isMaintenanceModeActive();

    if (!isMaintenanceActive) {
      return true;
    }

    // Check if user has bypass role
    const userRole = request.user?.role || request.user?.roles?.[0];
    if (userRole && this.maintenanceService.canBypass(userRole)) {
      return true;
    }

    // Check if this specific endpoint is disabled
    const isEndpointDisabled = this.maintenanceService.isEndpointDisabled(
      request.path,
    );

    const config = await this.maintenanceService.getMaintenanceConfig();
    const hasSpecificEndpoints =
      config.disabledEndpoints && config.disabledEndpoints.length > 0;

    // Block if: global maintenance with no specific endpoints, OR this endpoint is specifically disabled
    if (
      (isMaintenanceActive && !hasSpecificEndpoints) ||
      isEndpointDisabled
    ) {
      const maintenanceResponse =
        this.maintenanceService.getMaintenanceResponse();

      throw new HttpException(
        {
          ...maintenanceResponse,
          timestamp: new Date().toISOString(),
          path: request.path,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return true;
  }
}