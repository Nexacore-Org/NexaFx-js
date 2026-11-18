import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/** Routes that legitimately stream or run long and must not be cut off. */
const EXCLUDED_PATH_PATTERNS = [/\/exports\/[^/]+\/download/, /\/exports\/[^/]+\/stream/];

export interface TimeoutAwareRequest extends Request {
  /** Aborted when the request exceeds the timeout; pass it to outgoing calls to stop wasted work. */
  abortSignal?: AbortSignal;
}

export function isTimeoutExcluded(req: Pick<Request, 'headers' | 'originalUrl' | 'url'>): boolean {
  const accept = String(req.headers?.accept ?? '');
  if (accept.includes('text/event-stream')) return true;
  const url = (req.originalUrl ?? req.url ?? '').split('?')[0];
  return EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Issue #1546: bounds request duration. On timeout it aborts `req.abortSignal` and
 * answers 504 only if headers were not already sent, so it never corrupts a
 * response that has started. It cannot stop CPU-bound handler code; handlers that
 * call out should honour `req.abortSignal`. SSE and export downloads are excluded.
 */
@Injectable()
export class TimeoutMiddleware implements NestMiddleware {
  private readonly timeout = Number(process.env.REQUEST_TIMEOUT_MS) || 30000;

  use(req: TimeoutAwareRequest, res: Response, next: NextFunction): void {
    if (isTimeoutExcluded(req)) {
      next();
      return;
    }

    const controller = new AbortController();
    req.abortSignal = controller.signal;

    const timer = setTimeout(() => {
      controller.abort();
      if (!res.headersSent) {
        res.status(504).json({
          statusCode: 504,
          message: 'Gateway Timeout',
          correlationId: req.headers['x-correlation-id'] || '',
        });
      }
    }, this.timeout);

    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);
    next();
  }
}
