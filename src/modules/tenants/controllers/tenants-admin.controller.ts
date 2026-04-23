import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { TenantService } from '../services/tenant.service';

@Controller('admin/tenants')
@UseGuards(AdminGuard)
export class TenantsAdminController {
  constructor(private readonly tenants: TenantService) {}

  @Get()
  list() {
    return this.tenants.list();
  }

  @Post()
  create(@Body() body: Record<string, any>) {
    return this.tenants.create({
      slug: body.slug,
      name: body.name,
      isDefault: body.isDefault,
      whiteLabelConfig: body.whiteLabelConfig,
      featureFlags: body.featureFlags,
      rateLimit: body.rateLimit,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, any>) {
    return this.tenants.update(id, body);
  }

  @Patch(':id/feature-flags')
  updateFeatureFlags(
    @Param('id') id: string,
    @Body() flags: Record<string, boolean>,
  ) {
    return this.tenants.updateFeatureFlags(id, flags);
  }
}
