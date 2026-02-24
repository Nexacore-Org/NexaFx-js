import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import {
  SUPPORTED_VERSIONS,
  DEPRECATED_VERSIONS,
  CURRENT_API_VERSION,
  API_VERSION_HEADER,
} from '../constants/api-version.constants';

@Injectable()
export class VersionNegotiationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(VersionNegotiationMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    const pathVersion = this.extractVersionFromPath(req.path);
    const headerVersion = req.headers['x-api-version'] as string;
    const acceptVersion = this.parseAcceptVersion(
      req.headers['accept'] as string,
    );

    const requestedVersion = pathVersion ?? headerVersion ?? acceptVersion;

    if (requestedVersion) {
      if (DEPRECATED_VERSIONS.includes(requestedVersion as any)) {
        this.logger.warn(
          `Deprecated API version ${requestedVersion} accessed by ${req.ip} for ${req.path}`,
        );
      }

      if (
        !SUPPORTED_VERSIONS.includes(requestedVersion as any) &&
        !pathVersion
      ) {
        // For non-path-based versions we default to current
        res.setHeader(API_VERSION_HEADER, CURRENT_API_VERSION);
        res.setHeader(
          'X-API-Version-Negotiated',
          `Requested version ${requestedVersion} not supported, serving ${CURRENT_API_VERSION}`,
        );
      }
    }

    next();
  }

  private extractVersionFromPath(path: string): string | null {
    const match = path.match(/^\/v(\d+)\//);
    return match ? match[1] : null;
  }

  private parseAcceptVersion(acceptHeader?: string): string | null {
    if (!acceptHeader) return null;
    // Support: Accept: application/vnd.nexafx.v2+json
    const match = acceptHeader.match(/application\/vnd\.nexafx\.v(\d+)\+json/);
    return match ? match[1] : null;
  }
}
