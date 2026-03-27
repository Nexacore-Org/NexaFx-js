import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../../tenants/context/tenant-context.service';
import { TenantService } from '../../tenants/services/tenant.service';

@Injectable()
export class FeatureFlagEvaluationService {
  constructor(
    private readonly context: TenantContextService,
    private readonly tenantService: TenantService,
  ) {}

  async isEnabled(flagKey: string, defaultValue = false): Promise<boolean> {
    const tenantId = this.context.getTenantId();
    if (!tenantId) return defaultValue;

    const tenantConfig = await this.tenantService.getTenantConfig(tenantId);
    
    // Check if the tenant has a specific override for this flag
    if (tenantConfig.featureFlags && flagKey in tenantConfig.featureFlags) {
      return tenantConfig.featureFlags[flagKey];
    }

    return defaultValue;
  }
}