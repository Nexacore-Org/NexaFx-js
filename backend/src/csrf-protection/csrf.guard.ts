import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfService } from './csrf.service';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly csrfService: CsrfService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if CSRF protection is disabled for this route
    const isPublic = this.reflector.get<boolean>('isPublic', context.getHandler());
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const method = request.method.toLowerCase();

    // Only protect state-changing methods
    if (!['post', 'put', 'patch', 'delete'].includes(method)) {
      return true;
    }

    const sessionId = request.sessionID || request.headers['x-session-id'];
    const csrfToken = request.headers['x-csrf-token'] || request.body._csrf;

    if (!sessionId || !csrfToken) {
      throw new ForbiddenException('CSRF token missing');
    }

    const isValid = this.csrfService.validateToken(sessionId, csrfToken);
    if (!isValid) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}