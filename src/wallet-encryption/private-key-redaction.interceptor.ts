import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * PrivateKeyRedactionInterceptor
 * ───────────────────────────────
 * Last-line-of-defence: strips `privateKey`, `privateKeyEncrypted`,
 * and `private_key_encrypted` from ANY response body before it is sent
 * to the client — even if a developer accidentally returns a raw entity.
 *
 * Apply globally in AppModule or selectively on sensitive controllers.
 */
@Injectable()
export class PrivateKeyRedactionInterceptor implements NestInterceptor {
  private static readonly SENSITIVE_KEYS = new Set([
    'privateKey',
    'privateKeyEncrypted',
    'private_key',
    'private_key_encrypted',
  ]);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => this.redact(data)));
  }

  private redact(value: unknown): unknown {
    if (value === null || value === undefined) return value;

    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item));
    }

    if (typeof value === 'object') {
      const sanitised: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (PrivateKeyRedactionInterceptor.SENSITIVE_KEYS.has(k)) {
          // Omit entirely — not even a "[REDACTED]" placeholder
          continue;
        }
        sanitised[k] = this.redact(v);
      }
      return sanitised;
    }

    return value;
  }
}
