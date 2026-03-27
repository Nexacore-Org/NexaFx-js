import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantContextService } from '../context/tenant-context.service';
import { TenantService } from '../services/tenant.service';

@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(
    private readonly context: TenantContextService,
    private readonly tenantService: TenantService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] as string || req.subdomains[0];

    if (!tenantId) {
      throw new UnauthorizedException('Missing Tenant Identifier');
    }

    const tenant = await this.tenantService.validateTenant(tenantId);
    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException('Invalid or inactive tenant');
    }

    // Wrap the entire request lifecycle in the tenant context
    this.context.run(tenantId, () => next());
  }
}