import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { IpBlockService } from '../services/ip-block.service';
import { Request } from 'express';

@Injectable()
export class IpBlockGuard implements CanActivate {
  constructor(private readonly ipBlockService: IpBlockService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.getClientIP(request);

    if (!ip) {
      return true;
    }

    const isBlocked = await this.ipBlockService.isBlocked(ip);

    if (isBlocked) {
      const details = await this.ipBlockService.getBlockedIPDetails(ip);
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Access denied: IP address is blocked',
        reason: details?.reason || 'Unknown',
        blockedAt: details?.blockedAt,
        expiresAt: details?.expiresAt,
      });
    }

    return true;
  }

  private getClientIP(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || '';
  }
}
