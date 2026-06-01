import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { correlationIdStorage } from './correlation-id.storage';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      (req.headers[CORRELATION_ID_HEADER] as string) || uuidv4();

    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    correlationIdStorage.run(correlationId, () => next());
  }
}
