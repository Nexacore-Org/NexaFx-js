import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../../audit/audit.service';
import { maskBody } from '../../common/utils/redact';
import { redactUrl } from '../../common/utils/redact';
import { SKIP_AUDIT_KEY } from './decorators/skip-audit.decorator';
import { AuditAction } from './audit-actions';

interface AuditedRequest {
  method: string;
  originalUrl?: string;
  url?: string;
  route?: { path?: string };
  params?: Record<string, string>;
  body?: unknown;
  user?: { id?: string; sub?: string };
}

/**
 * Records every handler under `/admin/**` that is not marked `@SkipAudit()` (issue #1533): actor,
 * method, route, target id and outcome, with the body masked. Reads are recorded too, because
 * "who looked at this" is part of the compliance question. Handlers that write a richer, specific
 * audit entry still get this generic one; the two answer different questions.
 *
 * Audit failures never fail the request.
 */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AdminAuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<AuditedRequest>();
    const url = (request.originalUrl ?? request.url ?? '').split('?')[0];
    if (skip || !/(^|\/)admin(\/|$)/.test(url)) return next.handle();

    return next.handle().pipe(
      tap({
        next: () => this.record(request, 'success'),
        error: (err: { status?: number; message?: string }) =>
          this.record(request, 'failure', err?.status ?? 500),
      }),
    );
  }

  private record(request: AuditedRequest, outcome: 'success' | 'failure', status?: number): void {
    const params = request.params ?? {};
    const entityId = params.id ?? params.userId ?? params.jobId;
    this.audit
      .log({
        userId: request.user?.id ?? request.user?.sub,
        action: AuditAction.ADMIN_HTTP_REQUEST,
        entityType: 'admin_route',
        entityId,
        after: {
          method: request.method,
          route: request.route?.path ?? redactUrl(request.originalUrl ?? request.url),
          outcome,
          ...(status ? { status } : {}),
          body: maskBody(request.body),
        },
      })
      .catch((err: unknown) => {
        this.logger.error(`Failed to write admin audit entry: ${(err as Error)?.message ?? err}`);
      });
  }
}
