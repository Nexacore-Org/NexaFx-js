import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const COMPLIANCE_ROLES = ['compliance_officer', 'admin', 'super_admin'];

@Injectable()
export class ComplianceGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const userRoles: string[] = user.roles ?? [user.role];
    const hasAccess = userRoles.some((r) => COMPLIANCE_ROLES.includes(r));

    if (!hasAccess) {
      throw new ForbiddenException(
        'Compliance officer or admin role required',
      );
    }

    return true;
  }
}
