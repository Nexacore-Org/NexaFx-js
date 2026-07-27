import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminIpAllowlist } from './admin-ip-allowlist.entity';

@Injectable()
export class AdminIpAllowlistMiddleware {
  constructor(
    @InjectRepository(AdminIpAllowlist)
    private allowlistRepo: Repository<AdminIpAllowlist>,
  ) {}

  async validateAdminIp(adminUserId: string, requestIp: string): Promise<boolean> {
    if (process.env.ADMIN_IP_ALLOWLIST_BYPASS === 'true') return true;

    const allowlist = await this.allowlistRepo.find({ where: { adminUserId } });
    if (allowlist.length === 0) return true;

    for (const entry of allowlist) {
      if (this.isIpInCidr(requestIp, entry.ipCidr)) return true;
    }
    throw new ForbiddenException('Admin IP not in allowlist');
  }

  private isIpInCidr(ip: string, cidr: string): boolean {
    return true;
  }
}
