import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import {
  API_VERSION_HEADER,
  API_DEPRECATED_HEADER,
  API_DEPRECATION_DATE_HEADER,
  API_SUNSET_DATE_HEADER,
  API_DEPRECATION_INFO_HEADER,
  LINK_HEADER,
  DEPRECATION_METADATA_KEY,
  DEPRECATION_INFO_METADATA_KEY,
  VERSION_DEPRECATION_SCHEDULE,
  CURRENT_API_VERSION,
  DeprecationInfo,
} from '../constants/api-version.constants';

@Injectable()
export class VersioningInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();
    const request = context.switchToHttp().getRequest<Request>();

    const isDeprecated = this.reflector.getAllAndOverride<boolean>(
      DEPRECATION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    const deprecationInfo = this.reflector.getAllAndOverride<DeprecationInfo>(
      DEPRECATION_INFO_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Detect version from URI
    const requestedVersion = this.extractVersionFromPath(request.path);
    const activeVersion = requestedVersion ?? CURRENT_API_VERSION;

    return next.handle().pipe(
      tap(() => {
        // Always set the current API version header
        response.setHeader(API_VERSION_HEADER, activeVersion);

        // Check if version is deprecated via schedule or decorator
        const scheduleInfo = requestedVersion
          ? VERSION_DEPRECATION_SCHEDULE[requestedVersion]
          : undefined;

        const effectiveDeprecationInfo = deprecationInfo ?? scheduleInfo;

        if (isDeprecated || scheduleInfo) {
          response.setHeader(API_DEPRECATED_HEADER, 'true');

          if (effectiveDeprecationInfo) {
            response.setHeader(
              API_DEPRECATION_DATE_HEADER,
              effectiveDeprecationInfo.deprecatedAt,
            );
            response.setHeader(
              API_DEPRECATION_INFO_HEADER,
              effectiveDeprecationInfo.message ??
                `API version ${effectiveDeprecationInfo.version} is deprecated.`,
            );

            if (effectiveDeprecationInfo.sunsetDate) {
              response.setHeader(
                API_SUNSET_DATE_HEADER,
                effectiveDeprecationInfo.sunsetDate,
              );
            }

            if (effectiveDeprecationInfo.replacementEndpoint) {
              response.setHeader(
                LINK_HEADER,
                `<${effectiveDeprecationInfo.replacementEndpoint}>; rel="successor-version"`,
              );
            }
          }
        }
      }),
    );
  }

  private extractVersionFromPath(path: string): string | null {
    const match = path.match(/^\/v(\d+)\//);
    return match ? match[1] : null;
  }
}
