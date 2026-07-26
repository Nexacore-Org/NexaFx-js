import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TimeoutMiddleware implements NestMiddleware {
  private timeout = Number(process.env.REQUEST_TIMEOUT_MS) || 30000;

  use(req: Request, res: Response, next: NextFunction): void {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          statusCode: 504,
          message: 'Gateway Timeout',
          correlationId: req.headers['x-correlation-id'] || '',
        });
      }
    }, this.timeout);

    res.on('close', () => clearTimeout(timer));
    next();
  }
}
