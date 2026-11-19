import { getCorrelationId } from '../middleware/correlation-id.storage';
import { CORRELATION_ID_HEADER, pickCorrelationId } from '../middleware/correlation-id.middleware';
import { currentTraceId } from './trace-id';

/**
 * pino-http options that put the request id (and the OpenTelemetry trace id)
 * on every log line (issue #1546). Spread into `pinoHttp` in AppModule.
 */
export const correlationPinoOptions = {
  genReqId: (
    req: { headers: Record<string, unknown> },
    res: { setHeader(name: string, value: string): void },
  ): string => {
    const id = pickCorrelationId(req.headers[CORRELATION_ID_HEADER]);
    res.setHeader(CORRELATION_ID_HEADER, id);
    return id;
  },
  customProps: (req: { id?: unknown }) => {
    const traceId = currentTraceId();
    return {
      correlationId: getCorrelationId() ?? (typeof req.id === 'string' ? req.id : undefined),
      ...(traceId ? { traceId } : {}),
    };
  },
};
