import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // TODO: Implement actual JWT verification logic
    // For now, this is a placeholder that allows all requests
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('JWT token required');
    }

    return true;
  }
}
