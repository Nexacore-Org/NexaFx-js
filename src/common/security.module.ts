import { Module } from '@nestjs/common';
import { AdminRoleGuard } from './guards/admin-role.guard';
import { IpAllowlistGuard } from './guards/ip-allowlist.guard';

@Module({
  providers: [AdminRoleGuard, IpAllowlistGuard],
  exports: [AdminRoleGuard, IpAllowlistGuard],
})
export class SecurityModule {}
