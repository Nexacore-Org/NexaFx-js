import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AdminAuditService, AuditContext } from '../admin-audit.service';
import { ActorType } from '../entities/admin-audit-log.entity';
import { AUDIT_LOG_KEY, AuditLogOptions } from '../decorators/audit-log.decorator';
import { Reflector } from '@nestjs/core';

@Injectable()
export class AuditTrailInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditTrailInterceptor.name);

  constructor(
    private readonly adminAuditService: AdminAuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const auditOptions = this.reflector.get<AuditLogOptions>(
      AUDIT_LOG_KEY,
      context.getHandler(),
    );

    // Skip if audit is explicitly disabled
    if (auditOptions === null) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((data) => {
        this.logAudit(context, data, null, auditOptions);
      }),
      catchError((error) => {
        this.logAudit(context, null, error, auditOptions);
        throw error; // Re-throw the error
      }),
    );
  }

  private async logAudit(
    context: ExecutionContext,
    responseData: any,
    error?: any,
    auditOptions?: AuditLogOptions,
  ) {
    try {
      const request = context.switchToHttp().getRequest();
      const { method, url, body, params, query, user, ip, headers } = request;

      // Extract audit context
      const auditContext = this.buildAuditContext(request, context);

      // Handle different types of audit events
      if (this.isAuthEvent(url)) {
        await this.logAuthEvent(auditContext, request, error);
      } else if (this.isFinancialEvent(url)) {
        await this.logFinancialEvent(auditContext, request, responseData, error);
      } else if (auditOptions || this.isAdminEvent(url, user)) {
        await this.logGenericEvent(auditContext, request, responseData, error, auditOptions);
      }
    } catch (e) {
      this.logger.error('Failed to log audit trail', e);
      // Never block the primary operation
    }
  }

  private buildAuditContext(request: any, context: ExecutionContext): AuditContext {
    const user = request.user;
    const headers = request.headers;

    // Determine actor type and ID
    let actorType: ActorType = ActorType.USER;
    let actorId = user?.id;

    if (user?.role === 'admin' || user?.isAdmin) {
      actorType = ActorType.ADMIN;
    } else if (headers['x-api-key']) {
      actorType = ActorType.API;
      actorId = headers['x-api-client-id'] || 'api-client';
    } else if (!actorId) {
      actorType = ActorType.SYSTEM;
      actorId = 'system';
    }

    return {
      actorId,
      actorType,
      ip: this.extractIp(request),
      userAgent: headers['user-agent'],
      requestId: headers['x-request-id'] || this.generateRequestId(),
    };
  }

  private async logAuthEvent(context: AuditContext, request: any, error?: any) {
    const { url, body, user } = request;
    const success = !error;

    let action: any;
    let description: string;
    let metadata: any = {};

    // Determine auth action based on endpoint
    if (url.includes('/auth/login')) {
      action = success ? 'LOGIN' : 'LOGIN_FAILED';
      description = success ? 'User logged in successfully' : 'Login attempt failed';
      if (!success) {
        metadata.reason = error?.message || 'Invalid credentials';
      }
    } else if (url.includes('/auth/logout')) {
      action = 'LOGOUT';
      description = 'User logged out';
    } else if (url.includes('/auth/forgot-password')) {
      action = 'PASSWORD_RESET';
      description = 'Password reset requested';
      metadata.email = body?.email;
    } else if (url.includes('/auth/reset-password')) {
      action = 'PASSWORD_RESET_COMPLETED';
      description = 'Password reset completed successfully';
    } else if (url.includes('/auth/verify-email')) {
      action = 'EMAIL_VERIFIED';
      description = 'Email address verified successfully';
    } else if (url.includes('/auth/2fa/enable')) {
      action = '2FA_ENABLED';
      description = 'Two-factor authentication enabled';
    } else if (url.includes('/auth/2fa/disable')) {
      action = '2FA_DISABLED';
      description = 'Two-factor authentication disabled';
    } else {
      return; // Not an auth event we recognize
    }

    await this.adminAuditService.logAuthEvent(context, {
      userId: user?.id || body?.userId || 'unknown',
      email: user?.email || body?.email,
      action,
      success,
      reason: metadata.reason,
      metadata,
    });
  }

  private async logFinancialEvent(
    context: AuditContext,
    request: any,
    responseData: any,
    error?: any,
  ) {
    const { method, url, body, params, user } = request;
    const success = !error;

    let action: any;
    let entityId: string | undefined;
    let entityType: 'Transaction' | 'FXConversion' | 'Wallet' | undefined;
    let description: string;
    let metadata: any = {};

    // Determine financial action based on endpoint
    if (url.includes('/transactions')) {
      if (method === 'POST') {
        action = 'TRANSACTION_CREATED';
        entityId = responseData?.id;
        entityType = 'Transaction';
        description = `Transaction created: ${body?.amount} ${body?.currency}`;
        metadata = {
          amount: body?.amount,
          currency: body?.currency,
          type: body?.type,
          targetCurrency: body?.targetCurrency,
        };
      } else if (method === 'PUT' || method === 'PATCH') {
        action = 'TRANSACTION_UPDATED';
        entityId = params?.id;
        entityType = 'Transaction';
        description = 'Transaction details updated';
        metadata = { changes: this.extractChanges(body, responseData) };
      }
    } else if (url.includes('/fx/convert')) {
      action = 'FX_CONVERSION';
      entityId = responseData?.id;
      entityType = 'FXConversion';
      description = `FX conversion: ${body?.amount} ${body?.fromCurrency} to ${body?.toCurrency}`;
      metadata = {
        amount: body?.amount,
        fromCurrency: body?.fromCurrency,
        toCurrency: body?.toCurrency,
        rate: responseData?.rate,
        convertedAmount: responseData?.convertedAmount,
      };
    } else if (url.includes('/wallets')) {
      if (url.includes('/debit')) {
        action = 'WALLET_DEBIT';
        description = `Wallet debited: ${body?.amount} ${body?.currency}`;
      } else if (url.includes('/credit')) {
        action = 'WALLET_CREDIT';
        description = `Wallet credited: ${body?.amount} ${body?.currency}`;
      }
      entityId = params?.id || responseData?.id;
      entityType = 'Wallet';
      metadata = {
        amount: body?.amount,
        currency: body?.currency,
        walletId: entityId,
      };
    } else {
      return; // Not a financial event we recognize
    }

    if (!action || !entityId || !entityType) return;

    await this.adminAuditService.logFinancialEvent(context, {
      userId: user?.id || 'system',
      action,
      entityId,
      entityType,
      amount: metadata.amount,
      currency: metadata.currency,
      beforeSnapshot: error ? undefined : this.extractBeforeSnapshot(request),
      afterSnapshot: error ? undefined : this.extractAfterSnapshot(responseData),
      metadata,
    });
  }

  private async logGenericEvent(
    context: AuditContext,
    request: any,
    responseData: any,
    error?: any,
    auditOptions?: AuditLogOptions,
  ) {
    const { method, url, body, params } = request;

    let action = auditOptions?.action || this.deriveActionFromMethod(method);
    let entity = auditOptions?.entity || this.deriveEntityFromUrl(url);
    let entityId = auditOptions?.entityIdParam 
      ? params[auditOptions.entityIdParam] 
      : responseData?.id 
      || params?.id;

    const description = auditOptions?.description || `${action} ${entity}`;

    await this.adminAuditService.logAdminAction(context, {
      action,
      entity,
      entityId,
      beforeSnapshot: error ? undefined : this.extractBeforeSnapshot(request),
      afterSnapshot: error ? undefined : this.extractAfterSnapshot(responseData),
      description,
      metadata: {
        method,
        url,
        body: this.sanitizeBody(body),
        params,
        error: error ? { message: error.message, status: error.status } : undefined,
      },
    });
  }

  private isAuthEvent(url: string): boolean {
    return url.includes('/auth/') || url.includes('/login') || url.includes('/logout');
  }

  private isFinancialEvent(url: string): boolean {
    return url.includes('/transactions') || 
           url.includes('/fx/') || 
           url.includes('/wallets') ||
           url.includes('/payments');
  }

  private isAdminEvent(url: string, user: any): boolean {
    return url.includes('/admin/') || (user && (user.role === 'admin' || user.isAdmin));
  }

  private deriveActionFromMethod(method: string): string {
    const actions = {
      POST: 'CREATE',
      PUT: 'UPDATE',
      PATCH: 'UPDATE',
      DELETE: 'DELETE',
    };
    return actions[method] || method;
  }

  private deriveEntityFromUrl(url: string): string {
    const parts = url.split('/').filter(p => p && p !== 'admin');
    return parts[0] || 'unknown';
  }

  private extractIp(request: any): string {
    return request.ip || 
           request.connection?.remoteAddress || 
           request.headers['x-forwarded-for']?.split(',')[0] ||
           request.headers['x-real-ip'] ||
           'unknown';
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeBody(body: any): any {
    if (!body) return body;
    
    const sanitized = { ...body };
    const sensitiveKeys = [
      'password', 'token', 'secret', 'key', 'apiKey', 
      'creditCard', 'ssn', 'bankAccount', 'cvv'
    ];
    
    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        sanitized[key] = '***';
      }
    }
    
    return sanitized;
  }

  private extractBeforeSnapshot(request: any): Record<string, any> {
    // For mutations, we'd need to fetch the entity before the operation
    // This is a simplified version - in practice, you might use a repository
    // to fetch the current state before the mutation
    return {
      timestamp: new Date().toISOString(),
      requestId: request.headers['x-request-id'],
    };
  }

  private extractAfterSnapshot(responseData: any): Record<string, any> | undefined {
    if (!responseData) return undefined;
    
    // Remove sensitive fields from the response
    const sanitized = { ...responseData };
    const sensitiveKeys = ['passwordHash', 'passwordResetTokenHash', 'emailVerificationTokenHash'];
    
    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        delete sanitized[key];
      }
    }
    
    return sanitized;
  }

  private extractChanges(body: any, responseData: any): Record<string, any> {
    // Simplified change detection - in practice, you'd compare before/after states
    return {
      requested: this.sanitizeBody(body),
      result: responseData ? this.extractAfterSnapshot(responseData) : null,
    };
  }
}
