import { CacheInterceptor, CacheTTL, CacheKey } from '@nestjs/cache-manager';
import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';

const adminStatsTtlSeconds = parseInt(
  process.env.CACHE_ADMIN_STATS_TTL_SECONDS || '60',
  10,
);

@Controller('api/v1/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @UseInterceptors(CacheInterceptor)
  @CacheKey('admin-stats')
  @CacheTTL(adminStatsTtlSeconds)
  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }
}
