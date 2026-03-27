
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { ApiUsageService } from '../services/api-usage.service';
import { isPIIKey, scrubPIIFromUrl } from '../../../common/utils/pii-scrub';

@Injectable()
export class ApiUsageLoggingMiddleware implements NestMiddleware {
  constructor(private readonly apiUsageService: ApiUsageService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    // Try to extract userId from known locations (NestJS may attach user, or use header fallback)
    let userId: string | undefined = undefined;
    if (typeof (req as any).user === 'object' && (req as any).user && (req as any).user.id) {
      userId = (req as any).user.id;
    } else if (typeof req.headers['x-user-id'] === 'string') {
      userId = req.headers['x-user-id'] as string;
    }
    const route = scrubPIIFromUrl(req.originalUrl || req.url);
    const method = req.method;
    const userAgent = req.headers['user-agent'] as string;
    const ipAddress = req.ip || req.connection?.remoteAddress;

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const statusCode = res.statusCode;
      // Async, non-blocking log (use process.nextTick as fallback for setImmediate)
      const asyncLog = () => {
        this.apiUsageService.logRequest({
          route,
          method,
          userId,
          durationMs,
          statusCode,
          userAgent,
          ipAddress,
        });
      };
      if (typeof setImmediate !== 'undefined') {
        setImmediate(asyncLog);
      } else if (typeof process !== 'undefined' && typeof process.nextTick === 'function') {
        process.nextTick(asyncLog);
      } else {
        asyncLog();
      }
    });
    next();
  }
}


