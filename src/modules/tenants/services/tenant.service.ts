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
      where: [
        { id: idOrSlug, isActive: true },
        { slug: idOrSlug, isActive: true },
      ],
    });
  }

  async getDefaultTenant(): Promise<Tenant | null> {
    const configuredSlug = process.env.DEFAULT_TENANT_SLUG;
    if (configuredSlug) {
      const configured = await this.validateTenant(configuredSlug);
      if (configured) return configured;
    }

    const tenant = await this.tenantRepo.findOne({
      where: [
        { isDefault: true, isActive: true },
        { slug: 'default', isActive: true },
      ],
      order: { createdAt: 'ASC' },
    });
    if (tenant) return tenant;

    return this.tenantRepo.create({
      id: '00000000-0000-0000-0000-000000000000',
      slug: 'default',
      name: 'Default Tenant',
      isActive: true,
      isDefault: true,
      featureFlags: {},
      whiteLabelConfig: {},
      rateLimit: 1000,
    });
  }

  async list() {
    return this.tenantRepo.find({ order: { createdAt: 'DESC' } });
  }

  async create(input: Partial<Tenant>) {
    const tenant = this.tenantRepo.create({
      ...input,
      featureFlags: input.featureFlags ?? {},
      whiteLabelConfig: input.whiteLabelConfig ?? {},
      rateLimit: input.rateLimit ?? 1000,
      isActive: input.isActive ?? true,
    });
    return this.tenantRepo.save(tenant);
  }

  async update(id: string, input: Partial<Tenant>) {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    Object.assign(tenant, input);
    return this.tenantRepo.save(tenant);
  }

  async getTenantConfig(tenantId: string) {
    if (tenantId === '00000000-0000-0000-0000-000000000000') {
      const defaultTenant = await this.getDefaultTenant();
      if (!defaultTenant) throw new NotFoundException('Tenant not found');
      return defaultTenant;
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  // Used by Super Admins to toggle white-label features
  async updateFeatureFlags(tenantId: string, flags: Record<string, boolean>) {
    const tenant = await this.getTenantConfig(tenantId);
    tenant.featureFlags = { ...(tenant.featureFlags ?? {}), ...flags };
    await this.tenantRepo.save(tenant);
    return tenant;
  }
}
