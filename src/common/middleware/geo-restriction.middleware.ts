import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class GeoRestrictionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(GeoRestrictionMiddleware.name);

  constructor(
    private readonly config: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  use(request: Request, response: Response, next: NextFunction) {
    const blockedCountries =
      this.config.get<string[]>('compliance.blockedCountries') ?? [];
    const countryCode = String(
      request.headers['cf-ipcountry'] ??
        request.headers['x-country-code'] ??
        '',
    ).toUpperCase();

    if (countryCode && blockedCountries.includes(countryCode)) {
      const ipAddress = request.ip;
      this.logger.warn(
        `Blocked geo request from ${countryCode} (${ipAddress})`,
      );
      void this.auditService.log({
        action: 'geo.blocked',
        entityType: 'request',
        entityId: request.originalUrl,
        ipAddress,
        after: {
          countryCode,
          path: request.originalUrl,
          method: request.method,
        },
      });
      response.status(451).json({
        message: 'Unavailable For Legal Reasons',
        countryCode,
      });
      return;
    }

    next();
  }
}
