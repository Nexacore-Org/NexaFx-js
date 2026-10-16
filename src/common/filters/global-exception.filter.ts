import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from '@nestjs/common';
import { REDACTED, isSensitiveField, maskBody } from '../utils/redact';

export { REDACTED, isSensitiveField };

/**
 * Machine-readable fields an HttpException may deliberately carry to the
 * client (e.g. `{ requiresAction: 'accept_terms', version }`). Anything else in
 * an exception payload is dropped.
 */
export const PASSTHROUGH_FIELDS = ['requiresAction', 'version', 'submissionId', 'errors', 'code'] as const;

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
      userId: this.userIdOf(request),
    };

    if (status >= 500) {
      this.logger.error(logPayload);
    } else {
      this.logger.warn(logPayload);
    }

    const correlationId = (request.headers['x-correlation-id'] as string) ?? undefined;
    const errorResponse: Record<string, unknown> = {
      statusCode: status,
      message: this.messageOf(message),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Client errors may carry Nest's `error` label and an allow-listed set of
    // structured fields. Server errors stay generic: nothing from the exception
    // payload is forwarded.
    if (status < 500 && exception instanceof HttpException && typeof message === 'object' && message !== null) {
      const payload = message as Record<string, unknown>;
      if (typeof payload.error === 'string') {
        errorResponse.error = payload.error;
      }
      for (const field of PASSTHROUGH_FIELDS) {
        if (payload[field] !== undefined) {
          errorResponse[field] = payload[field];
        }
      }
    }

    if (correlationId) {
      errorResponse.correlationId = correlationId;
    }

    response.status(status).json(errorResponse);
  }

  /** Resolve a client-safe message; ValidationPipe array messages are kept as arrays. */
  private messageOf(message: string | object): string | string[] {
    if (typeof message === 'string') return message;
    const inner = (message as Record<string, unknown>).message;
    if (Array.isArray(inner)) return inner.map(String);
    if (typeof inner === 'string' && inner.length > 0) return inner;
    return 'Error';
  }

  /** The global guard sets `request.user.id` (and `sub`); accept either. */
  private userIdOf(request: Request): string | undefined {
    const user = (request as Request & { user?: { id?: string; sub?: string } }).user;
    return user?.id ?? user?.sub ?? undefined;
  }
}
