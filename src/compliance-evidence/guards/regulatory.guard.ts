// src/modules/compliance/guards/regulatory.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ComplianceService } from '../compliance.service';

@Injectable()
export class RegulatoryGuard implements CanActivate {
  constructor(private complianceService: ComplianceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { countryCode, amount, asset } = request.body;

    // Use the engine to validate
    return await this.complianceService.validateAction(countryCode, amount, asset);
  }
}