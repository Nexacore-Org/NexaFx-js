import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../../tenants/context/tenant-context.service';
import { TenantService } from '../../tenants/services/tenant.service';

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly context: TenantContextService,
    private readonly tenantService: TenantService,
  ) {}

  async isEnabled(flagKey: string, defaultValue = false): Promise<boolean> {
    const tenantId = this.context.getTenantId();
    if (!tenantId) return defaultValue;

    const tenantConfig = await this.tenantService.getTenantConfig(tenantId);
    if (tenantConfig.featureFlags && flagKey in tenantConfig.featureFlags) {
      return tenantConfig.featureFlags[flagKey];
    }

    return defaultValue;
  }
}
