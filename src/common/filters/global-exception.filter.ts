import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from '@nestjs/common';

const SENSITIVE_FIELDS = new Set(['password', 'otp', 'totpCode', 'secretKey']);

function maskBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    masked[key] = SENSITIVE_FIELDS.has(key) ? '[REDACTED]' : value;
  }
  return masked;
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

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      this.logger.error(`Unexpected exception: ${(exception as Error).message}`, (exception as Error).stack);
    }

    const logPayload = {
      method: request.method,
      path: request.url,
      body: maskBody(request.body),
      error: typeof message === 'string' ? message : (message as Record<string, unknown>).message ?? 'Error',
      correlationId: (request.headers['x-correlation-id'] as string) ?? undefined,
      userId: (request as Request & { user?: { id?: string } }).user?.id ?? undefined,
    };

    if (status >= 500) {
      this.logger.error(logPayload);
    } else {
      this.logger.warn(logPayload);
    }

    const errorResponse = {
      statusCode: status,
      message: typeof message === 'string' ? message : (message as Record<string, unknown>).message || 'Error',
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }
}
