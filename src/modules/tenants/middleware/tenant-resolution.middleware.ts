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
    const tenantIdentifier =
      (req.headers['x-tenant-id'] as string | undefined) ||
      req.subdomains?.[0];

    const tenant = tenantIdentifier
      ? await this.tenantService.validateTenant(tenantIdentifier)
      : await this.tenantService.getDefaultTenant();
    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException('Invalid or inactive tenant');
    }

    (req as any).tenant = tenant;
    this.context.run(tenant.id, () => next());
  }
}
