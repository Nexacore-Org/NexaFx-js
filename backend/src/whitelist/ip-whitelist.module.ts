import { Module } from '@nestjs/common';
import { IpWhitelistController } from './ip-whitelist.controller';
import { IpWhitelistService } from './ip-whitelist.service';
import { IpWhitelistGuard } from './ip-whitelist.guard';

@Module({
  controllers: [IpWhitelistController],
  providers: [IpWhitelistService, IpWhitelistGuard],
  exports: [IpWhitelistService, IpWhitelistGuard],
})
export class IpWhitelistModule {}

// ===== 7. admin.controller.ts (Example Protected Controller) =====
import { Controller, Get, UseGuards } from '@nestjs/common';

@Controller('admin')
@UseGuards(IpWhitelistGuard)
export class AdminController {
  @Get('dashboard')
  getDashboard() {
    return {
      message: 'Welcome to admin dashboard',
      data: {
        users: 100,
        revenue: '$50,000',
        orders: 250,
      },
    };
  }

  @Get('users')
  getUsers() {
    return {
      message: 'Admin users list',
      data: [
        { id: 1, name: 'Admin User', role: 'super_admin' },
        { id: 2, name: 'Manager', role: 'admin' },
      ],
    };
  }

  @Get('settings')
  getSettings() {
    return {
      message: 'System settings',
      data: {
        maintenance_mode: false,
        max_users: 1000,
        rate_limit: 100,
      },
    };
  }
}
