import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RiskManagerService } from '../services/risk-manager.service';

@Injectable()
export class MarginUtilizationGuard implements CanActivate {
  constructor(private riskService: RiskManagerService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user.id;

    const utilization = await this.riskService.calculateMarginUtilization(userId);

    if (utilization > 90) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Position creation blocked',
        reason: 'MARGIN_UTILIZATION_TOO_HIGH',
        currentUtilization: `${utilization}%`,
      });
    }

    return true;
  }
}