import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async validateTenant(idOrSlug: string): Promise<Tenant | null> {
    return this.tenantRepo.findOne({
      where: [{ id: idOrSlug }, { slug: idOrSlug }],
    });
  }

  async getTenantConfig(tenantId: string) {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  // Used by Super Admins to toggle white-label features
  async updateFeatureFlags(tenantId: string, flags: Record<string, boolean>) {
    await this.tenantRepo.update(tenantId, { featureFlags: flags });
    return { success: true };
  }
}