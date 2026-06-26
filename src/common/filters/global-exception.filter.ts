import { Catch, ExceptionFilter, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

const SENSITIVE_FIELDS = new Set(['password', 'otp', 'totpCode', 'secretKey']);

type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE_ENTITY'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR';

function maskBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    masked[key] = SENSITIVE_FIELDS.has(key) ? '[REDACTED]' : value;
  }
  return masked;
}

function resolveErrorCode(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'UNPROCESSABLE_ENTITY';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'TOO_MANY_REQUESTS';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | object;
    let code: ErrorCode;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
      code = resolveErrorCode(status);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      code = 'INTERNAL_ERROR';
      this.logger.error(
        `Unexpected exception: ${(exception as Error).message}`,
        (exception as Error).stack,
      );
    }

    const logPayload = {
      method: request.method,
      path: request.url,
      body: maskBody(request.body),
      error:
        typeof message === 'string'
          ? message
          : (message as Record<string, unknown>).message ?? 'Error',
      correlationId: (request.headers['x-correlation-id'] as string) ?? undefined,
      userId: (request as Request & { user?: { id?: string } }).user?.id ?? undefined,
    };

    if (status >= 500) {
      this.logger.error(logPayload);
    } else {
      this.logger.warn(logPayload);
    }

    response.status(status).json({
      statusCode: status,
      code,
      message:
        typeof message === 'string'
          ? message
          : (message as Record<string, unknown>).message || 'Error',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
