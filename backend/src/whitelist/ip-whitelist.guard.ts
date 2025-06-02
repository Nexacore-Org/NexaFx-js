import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IpWhitelistService } from './ip-whitelist.service';

export const SKIP_IP_WHITELIST_KEY = 'skipIpWhitelist';
export const SkipIpWhitelist = () => Reflector.createDecorator<boolean>({ key: SKIP_IP_WHITELIST_KEY });

@Injectable()
export class IpWhitelistGuard implements CanActivate {
  private readonly logger = new Logger(IpWhitelistGuard.name);

  constructor(
    private readonly ipWhitelistService: IpWhitelistService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if IP whitelist should be skipped for this route
    const skipIpWhitelist = this.reflector.getAllAndOverride<boolean>(SKIP_IP_WHITELIST_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipIpWhitelist) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = this.getClientIp(request);

    this.logger.debug(`Checking IP whitelist for: ${clientIp}`);

    const isWhitelisted = await this.ipWhitelistService.isIpWhitelisted(clientIp);

    if (!isWhitelisted) {
      this.logger.warn(`Access denied for non-whitelisted IP: ${clientIp}`);
      throw new ForbiddenException(`Access denied. IP address ${clientIp} is not whitelisted.`);
    }

    this.logger.debug(`Access granted for whitelisted IP: ${clientIp}`);
    return true;
  }

  private getClientIp(request: Request): string {
    // Check various headers for the real IP address
    const xForwardedFor = request.headers['x-forwarded-for'];
    const xRealIp = request.headers['x-real-ip'];
    const connectionRemoteAddress = request.connection?.remoteAddress;
    const socketRemoteAddress = request.socket?.remoteAddress;
    const requestIp = request.ip;

    let clientIp: string;

    if (xForwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      clientIp = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor.split(',')[0];
    } else if (xRealIp) {
      clientIp = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
    } else {
      clientIp = connectionRemoteAddress || socketRemoteAddress || requestIp || 'unknown';
    }

    // Clean up IPv6 mapped IPv4 addresses
    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.substring(7);
    }

    return clientIp.trim();
  }
}
