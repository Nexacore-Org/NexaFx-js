import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  SUPPORTED_VERSIONS,
  DEPRECATED_VERSIONS,
  CURRENT_API_VERSION,
  VERSION_DEPRECATION_SCHEDULE,
} from '../constants/api-version.constants';

@Catch(NotFoundException)
export class UnsupportedVersionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UnsupportedVersionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const versionMatch = request.path.match(/^\/v(\d+)\//);
    if (!versionMatch) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const requestedVersion = versionMatch[1];

    if (!SUPPORTED_VERSIONS.includes(requestedVersion as any)) {
      const deprecationInfo = VERSION_DEPRECATION_SCHEDULE[requestedVersion];
      const isSunset =
        deprecationInfo?.sunsetDate &&
        new Date() > new Date(deprecationInfo.sunsetDate);

      const status = isSunset ? HttpStatus.GONE : HttpStatus.NOT_FOUND;

      this.logger.warn(
        `Request to unsupported API version: v${requestedVersion} from ${request.ip}`,
      );

      response.status(status).json({
        statusCode: status,
        error: isSunset ? 'Gone' : 'Not Found',
        message: isSunset
          ? `API v${requestedVersion} has been sunset and is no longer available.`
          : `API v${requestedVersion} is not supported.`,
        supportedVersions: SUPPORTED_VERSIONS,
        currentVersion: CURRENT_API_VERSION,
        deprecatedVersions: DEPRECATED_VERSIONS,
        ...(deprecationInfo?.replacementEndpoint && {
          migrationGuide: `Please migrate to ${deprecationInfo.replacementEndpoint}`,
        }),
      });
      return;
    }

    // Pass through for valid versions
    response.status(exception.getStatus()).json(exception.getResponse());
  }
}
