import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AdminAuditService } from '../admin-audit.service';

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AdminAuditInterceptor.name);

  constructor(private readonly adminAuditService: AdminAuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;

    // Skip GET requests generally if we only want to audit state changes?
    // Requirement says "admin actions". Usually implies writes.
    // But "Add middleware/interceptor to capture admin requests" is broad.
    // Let's exclude GET requests for now to avoid noise, OR at least exclude the audit log endpoint itself.
    if (method === 'GET' && url.includes('/audit-logs')) {
      return next.handle();
    }
    
    // Only intercept if it looks like an admin request.
    // Assuming 'x-admin' header or if the route is under /admin (except audit-logs which is already excluded above if GET)
    // or if the user is an admin.
    const isAdmin = request.headers['x-admin'] === 'true' || request.user?.isAdmin; 
    
    // If not admin, maybe we shouldn't log as "Admin Audit", but maybe security audit?
    // For this task, I'll assume we only want to log if it is an admin action.
    if (!isAdmin) {
       return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          this.logAudit(request, data);
        },
        error: (err) => {
          // Optional: Log failed attempts too?
          // The requirement says "Admin actions are traceable". Failed actions are also actions.
          this.logAudit(request, null, err);
        },
      }),
    );
  }

  private logAudit(request: any, responseData: any, error?: any) {
    try {
      const { method, url, body, params, query, user, ip, headers } = request;
      const adminId = user?.id || headers['x-admin-id'] || 'unknown';
      
      // Simple heuristic for Action
      let action = method;
      if (method === 'POST') action = 'CREATE';
      else if (method === 'PUT' || method === 'PATCH') action = 'UPDATE';
      else if (method === 'DELETE') action = 'DELETE';

      // Simple heuristic for Entity
      // Url might be /admin/users/123
      const parts = url.split('/').filter((p) => p && p !== 'admin');
      const entity = parts[0] || 'unknown';
      const entityId = parts[1] || (responseData && responseData.id) || null;

      const metadata = {
        method,
        url,
        body: this.sanitize(body),
        query,
        params,
        error: error ? error.message : undefined,
      };

      this.adminAuditService.logAction({
        actorId: adminId,
        actorType: 'admin' as any,
        action,
        entity,
        entityId: typeof entityId === 'string' || typeof entityId === 'number' ? String(entityId) : undefined,
        metadata,
        ip: ip || request.connection?.remoteAddress,
      });
    } catch (e) {
      this.logger.error('Failed to log admin audit', e);
    }
  }

  private sanitize(body: any) {
    if (!body) return body;
    const sanitized = { ...body };
    const sensitiveKeys = ['password', 'token', 'secret'];
    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        sanitized[key] = '***';
      }
    }
    return sanitized;
  }
}
