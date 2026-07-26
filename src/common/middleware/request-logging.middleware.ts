import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const correlationId =
      (req.headers['x-correlation-id'] as string) ??
      (req.headers['x-request-id'] as string) ??
      '-';
    const start = Date.now();

    res.on('finish', () => {
      this.logger.log(
        JSON.stringify({
          method,
          url: originalUrl,
          status: res.statusCode,
          duration: Date.now() - start,
          correlationId,
        }),
      );
    });

    next();
  }
}
