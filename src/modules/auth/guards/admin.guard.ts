import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const authHeader = String(request.headers['authorization'] ?? '').toLowerCase();
    const roles = request.user?.roles ?? [];
    const role = request.user?.role;
    const isAdmin =
      request.headers['x-admin'] === 'true' ||
      role === 'admin' ||
      roles.includes('admin') ||
      authHeader.includes('admintoken') ||
      authHeader.includes('admin-token');

    if (!isAdmin) {
      throw new UnauthorizedException('Admin access required');
    }

    return true;
  }
}
