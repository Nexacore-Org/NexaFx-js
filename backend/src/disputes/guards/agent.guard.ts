import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

interface RequestWithUser {
  user?: { id?: string; isAgent?: boolean; isAdmin?: boolean };
}

@Injectable()
export class AgentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!user.isAgent && !user.isAdmin) {
      throw new ForbiddenException('Agent access required');
    }

    return true;
  }
}
