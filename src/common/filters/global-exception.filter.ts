import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from '@nestjs/common';

export const REDACTED = '[REDACTED]';

/**
 * Substrings that make a field name sensitive wherever they appear, so a newly
 * added field such as `webhookSecret` or `newPasswordHash` is covered without
 * anyone remembering to update a list. Matched case-insensitively against the
 * key with separators stripped, so `api_key`, `apiKey` and `API-KEY` all match.
 */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'apikey',
  'credential',
  'privatekey',
  'mnemonic',
  'seedphrase',
  'signature',
  'otp',
  'totp',
  'backupcode',
  'recoverycode',
  'authorization',
  'cookie',
  'cvv',
];

/**
 * Field names that are sensitive on their own but too generic to match as a
 * substring — redacting every key containing "code" would also hide
 * `countryCode` and `referralCode`, which are useful when debugging.
 */
const SENSITIVE_KEY_EXACT = new Set(['code', 'pin', 'auth', 'key', 'hash']);

const MAX_MASK_DEPTH = 6;

export function isSensitiveField(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    SENSITIVE_KEY_EXACT.has(normalised) ||
    SENSITIVE_KEY_PATTERNS.some((pattern) => normalised.includes(pattern))
  );
}

function maskBody(body: unknown, depth = 0): unknown {
  if (!body || typeof body !== 'object') return body;
  if (depth >= MAX_MASK_DEPTH) return REDACTED;

  if (Array.isArray(body)) {
    return body.map((entry) => maskBody(entry, depth + 1));
  }

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    masked[key] = isSensitiveField(key) ? REDACTED : maskBody(value, depth + 1);
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
