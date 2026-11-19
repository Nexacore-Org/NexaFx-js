import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { correlationIdStorage } from './correlation-id.storage';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** A client supplied id is only trusted when it cannot be used for log injection. */
export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

export function pickCorrelationId(candidate: unknown): string {
  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  return typeof value === 'string' && CORRELATION_ID_PATTERN.test(value) ? value : uuidv4();
}

/**
 * Issue #1546: applied to every route by AppModule.configure(). Sets the id on
 * the request (so GlobalExceptionFilter and handlers can read it), on the
 * response header, and in AsyncLocalStorage (so loggers and queue producers can
 * read it without threading it through call signatures).
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // pino-http (genReqId) may already have chosen the id for this request; reuse it so
    // the access log line and everything else agree.
    const preset = (req as Request & { id?: unknown }).id;
    const correlationId =
      typeof preset === 'string' && CORRELATION_ID_PATTERN.test(preset)
        ? preset
        : pickCorrelationId(req.headers[CORRELATION_ID_HEADER]);

    req.headers[CORRELATION_ID_HEADER] = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    correlationIdStorage.run(correlationId, () => next());
  }
}
