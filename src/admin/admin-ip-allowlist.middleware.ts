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
    try {
      const parts = cidr.split('/');
      const range = parts[0] ?? '';
      const prefixStr = parts[1] ?? '';
      const prefix = parseInt(prefixStr, 10);

      if (prefix === 0) return true;

      const ipNum = this.ipToNumber(ip);
      const rangeNum = this.ipToNumber(range);

      if (ipNum === null || rangeNum === null) return false;

      const mask = ~((1 << (32 - prefix)) - 1) >>> 0;
      return (ipNum & mask) === (rangeNum & mask);
    } catch {
      return false;
    }
  }

  private ipToNumber(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;

    let num = 0;
    for (const part of parts) {
      const octet = parseInt(part, 10);
      if (isNaN(octet) || octet < 0 || octet > 255) return null;
      num = (num << 8) | octet;
    }
    return num >>> 0;
  }
}
