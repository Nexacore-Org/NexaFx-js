import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AdminAuditService } from '../admin-audit.service';
import { AUDIT_LOG_KEY, AuditLogOptions } from '../decorators/audit-log.decorator';
import { SKIP_AUDIT_KEY } from '../decorators/skip-audit.decorator';
import { ActorType } from '../entities/admin-audit-log.entity';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  // Comprehensive list of sensitive fields to mask
  private readonly sensitiveFields = [
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'privateKey',
    'private_key',
    'creditCard',
    'credit_card',
    'cardNumber',
    'card_number',
    'cvv',
    'cvc',
    'ssn',
    'socialSecurity',
    'social_security',
    'pin',
    'passcode',
    'authCode',
    'auth_code',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'bearer',
    'authorization',
    'x-api-key',
    'x-api-secret',
    'seed',
    'mnemonic',
    'walletSeed',
    'wallet_seed',
  ];

  constructor(
    private readonly adminAuditService: AdminAuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();

    // Check if @SkipAudit() decorator is present
    const skipAudit = this.reflector.get<boolean>(SKIP_AUDIT_KEY, handler);
    if (skipAudit) {
      return next.handle();
    }

    // Check if @AuditLog() decorator is present
    const auditOptions = this.reflector.get<AuditLogOptions>(
      AUDIT_LOG_KEY,
      handler,
    );

    // Skip GET requests unless explicitly annotated with @AuditLog
    const method = request.method;
    if (method === 'GET' && !auditOptions) {
      return next.handle();
    }

    // Skip audit log endpoints to avoid recursion
    if (request.url.includes('/audit-logs')) {
      return next.handle();
    }

    // Capture before state if entityId is provided in params
    const beforeSnapshot = this.captureBeforeState(request, auditOptions);

    return next.handle().pipe(
      tap({
        next: (data) => {
          this.logAudit(request, auditOptions, data, beforeSnapshot, null);
        },
        error: (err) => {
          this.logAudit(request, auditOptions, null, beforeSnapshot, err);
        },
      }),
    );
  }

  private captureBeforeState(
    request: any,
    auditOptions?: AuditLogOptions,
  ): Record<string, any> | undefined {
    // This is a placeholder for capturing entity state before modification
    // In a real implementation, you might fetch the entity from database
    // before the operation and store its state
    if (auditOptions?.entityIdParam && request.params[auditOptions.entityIdParam]) {
      // Return a marker that indicates we attempted to capture before state
      return { _note: 'Before state capture not implemented - entity ID available' };
    }
    return undefined;
  }

  private logAudit(
    request: any,
    auditOptions: AuditLogOptions | undefined,
    responseData: any,
    beforeSnapshot: Record<string, any> | undefined,
    error: any | null,
  ) {
    try {
      const { method, url, body, params, query, user, ip, headers } = request;

      // Determine actor type and ID
      let actorId: string;
      let actorType: ActorType;

      if (user?.isAdmin) {
        actorType = ActorType.ADMIN;
        actorId = user.id;
      } else if (user?.id) {
        actorType = ActorType.USER;
        actorId = user.id;
      } else if (headers['x-api-key']) {
        actorType = ActorType.API;
        actorId = headers['x-api-key'].substring(0, 8) + '...';
      } else {
        actorType = ActorType.SYSTEM;
        actorId = 'system';
      }

      // Determine action from decorator or HTTP method
      let action: string;
      if (auditOptions?.action) {
        action = auditOptions.action;
      } else {
        switch (method) {
          case 'POST':
            action = 'CREATE';
            break;
          case 'PUT':
          case 'PATCH':
            action = 'UPDATE';
            break;
          case 'DELETE':
            action = 'DELETE';
            break;
          default:
            action = method;
        }
      }

      // Determine entity from decorator or URL path
      let entity: string;
      let entityId: string | undefined;

      if (auditOptions?.entity) {
        entity = auditOptions.entity;
        entityId = auditOptions.entityIdParam
          ? params[auditOptions.entityIdParam]
          : undefined;
      } else {
        // Extract entity from URL path
        const urlParts = url.split('/').filter((p: string) => p);
        // Skip common prefixes like 'api', 'v1', 'admin'
        const skipPrefixes = ['api', 'v1', 'v2', 'admin'];
        const relevantParts = urlParts.filter(
          (p: string) => !skipPrefixes.includes(p.toLowerCase()),
        );

        entity = relevantParts[0] || 'unknown';
        entityId = relevantParts[1];
      }

      // If response data has an ID, use it as entityId
      if (responseData?.id) {
        entityId = String(responseData.id);
      }

      // Build after snapshot from response data
      const afterSnapshot = responseData
        ? this.sanitizeSnapshot(responseData, auditOptions?.maskFields)
        : undefined;

      // Build metadata
      const metadata: Record<string, any> = {
        method,
        url,
        query: this.sanitize(query),
        params: this.sanitize(params),
        requestBody: this.sanitize(body, auditOptions?.maskFields),
        error: error ? error.message : undefined,
      };

      this.adminAuditService.logAction({
        actorId,
        actorType,
        action,
        entity,
        entityId: entityId ? String(entityId) : undefined,
        beforeSnapshot,
        afterSnapshot,
        metadata,
        ip: ip || request.connection?.remoteAddress,
        userAgent: headers['user-agent'],
        description: auditOptions?.description,
      });
    } catch (e) {
      this.logger.error('Failed to log audit', e);
    }
  }

  private sanitize(
    data: any,
    additionalMaskFields?: string[],
  ): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    const fieldsToMask = [
      ...this.sensitiveFields,
      ...(additionalMaskFields || []),
    ];

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      const shouldMask = fieldsToMask.some(
        (field) =>
          lowerKey === field.toLowerCase() ||
          lowerKey.includes(field.toLowerCase()),
      );

      if (shouldMask) {
        sanitized[key] = '***MASKED***';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitize(sanitized[key], additionalMaskFields);
      }
    }

    return sanitized;
  }

  private sanitizeSnapshot(
    data: any,
    additionalMaskFields?: string[],
  ): Record<string, any> {
    if (!data || typeof data !== 'object') {
      return { value: data };
    }

    // Limit snapshot size to prevent storing huge objects
    const maxDepth = 3;
    return this.sanitizeWithDepth(data, additionalMaskFields, 0, maxDepth);
  }

  private sanitizeWithDepth(
    data: any,
    additionalMaskFields: string[] | undefined,
    currentDepth: number,
    maxDepth: number,
  ): any {
    if (currentDepth >= maxDepth) {
      return '[Max depth reached]';
    }

    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) =>
        this.sanitizeWithDepth(item, additionalMaskFields, currentDepth + 1, maxDepth),
      );
    }

    const sanitized: Record<string, any> = {};
    const fieldsToMask = [
      ...this.sensitiveFields,
      ...(additionalMaskFields || []),
    ];

    for (const key of Object.keys(data)) {
      const lowerKey = key.toLowerCase();
      const shouldMask = fieldsToMask.some(
        (field) =>
          lowerKey === field.toLowerCase() ||
          lowerKey.includes(field.toLowerCase()),
      );

      if (shouldMask) {
        sanitized[key] = '***MASKED***';
      } else if (typeof data[key] === 'object' && data[key] !== null) {
        sanitized[key] = this.sanitizeWithDepth(
          data[key],
          additionalMaskFields,
          currentDepth + 1,
          maxDepth,
        );
      } else {
        sanitized[key] = data[key];
      }
    }

    return sanitized;
  }
}
