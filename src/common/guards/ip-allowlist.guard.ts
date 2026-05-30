import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

function normalizeIp(address?: string): string {
  if (!address) {
    return '';
  }

  if (address.startsWith('::ffff:')) {
    return address.slice(7);
  }

  return address;
}

function ipv4ToNumber(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const bytes = parts.map((part) => {
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255 ? value : NaN;
  });

  if (bytes.some(Number.isNaN)) {
    return null;
  }

  return (
    ((bytes[0] << 24) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3]) >>> 0
  );
}

function cidrContainsIp(ip: string, cidr: string): boolean {
  const [network, maskLengthRaw] = cidr.split('/');
  if (!maskLengthRaw) {
    return normalizeIp(ip) === normalizeIp(network);
  }

  const maskLength = Number(maskLengthRaw);
  const networkNumber = ipv4ToNumber(normalizeIp(network));
  const ipNumber = ipv4ToNumber(normalizeIp(ip));

  if (
    networkNumber === null ||
    ipNumber === null ||
    !Number.isInteger(maskLength) ||
    maskLength < 0 ||
    maskLength > 32
  ) {
    return false;
  }

  const mask = maskLength === 0 ? 0 : (0xffffffff << (32 - maskLength)) >>> 0;
  return (networkNumber & mask) === (ipNumber & mask);
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
        'ADMIN_ALLOWED_IPS is not configured; allowing admin requests from any IP',
      );
      return true;
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
