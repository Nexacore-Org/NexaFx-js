import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { BlockList, isIPv4, isIPv6 } from 'node:net';

function normalizeIp(address?: string): string {
  if (!address) {
    return '';
  }

  if (address.startsWith('::ffff:')) {
    return address.slice(7);
  }

  return address;
}

function ipFamily(address: string): 'ipv4' | 'ipv6' | null {
  if (isIPv4(address)) return 'ipv4';
  if (isIPv6(address)) return 'ipv6';
  return null;
}

function cidrContainsIp(ip: string, cidr: string): boolean {
  const [rawNetwork, maskLengthRaw] = cidr.split('/');
  const network = normalizeIp(rawNetwork);
  const address = normalizeIp(ip);
  const family = ipFamily(network);

  if (!family || family !== ipFamily(address)) {
    return false;
  }

  const list = new BlockList();
  if (maskLengthRaw === undefined) {
    list.addAddress(network, family);
  } else {
    const maskLength = Number(maskLengthRaw);
    const maxLength = family === 'ipv4' ? 32 : 128;
    if (
      maskLengthRaw === '' ||
      !Number.isInteger(maskLength) ||
      maskLength < 0 ||
      maskLength > maxLength
    ) {
      return false;
    }
    list.addSubnet(network, maskLength, family);
  }

  return list.check(address, family);
}

@Injectable()
export class IpAllowlistGuard implements CanActivate {
  private readonly logger = new Logger(IpAllowlistGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedIps =
      this.config
        .get<string[]>('security.adminAllowedIps')
        ?.map((ip) => ip.trim())
        .filter(Boolean) ?? [];

    if (allowedIps.length === 0) {
      this.logger.warn(
        'ADMIN_ALLOWED_IPS is not configured; denying admin requests',
      );
      throw new ForbiddenException(
        'ADMIN_ALLOWED_IPS is not configured; admin access denied',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const ipAddress = normalizeIp(request.ip);

    if (
      !ipAddress ||
      !allowedIps.some((allowedIp) => cidrContainsIp(ipAddress, allowedIp))
    ) {
      throw new ForbiddenException(
        'IP address is not allowlisted for admin access',
      );
    }

    return true;
  }
}
