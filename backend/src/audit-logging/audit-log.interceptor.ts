import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
  } from '@nestjs/common';
  import { Observable } from 'rxjs';
  import { tap } from 'rxjs/operators';
  import { Reflector } from '@nestjs/core';
  import { AuditLogService } from './audit-log.service';
  import { AuditActionType } from './audit-log.entity';
  
  export const AUDIT_LOG_KEY = 'audit_log';
  export const AuditLog = (actionType: AuditActionType, description?: string) =>
    SetMetadata(AUDIT_LOG_KEY, { actionType, description });
  
  @Injectable()
  export class AuditLogInterceptor implements NestInterceptor {
    constructor(
      private readonly auditLogService: AuditLogService,
      private readonly reflector: Reflector,
    ) {}
  
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      const auditConfig = this.reflector.get<{
        actionType: AuditActionType;
        description?: string;
      }>(AUDIT_LOG_KEY, context.getHandler());
  
      if (!auditConfig) {
        return next.handle();
      }
  
      const request = context.switchToHttp().getRequest();
      const user = request.user;
  
      return next.handle().pipe(
        tap(() => {
          if (user) {
            this.auditLogService.logUserAction(
              auditConfig.actionType,
              user.id,
              {
                userEmail: user.email,
                description: auditConfig.description,
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
                metadata: {
                  method: request.method,
                  url: request.url,
                  body: request.body,
                },
              },
            );
          }
        }),
      );
    }
  }