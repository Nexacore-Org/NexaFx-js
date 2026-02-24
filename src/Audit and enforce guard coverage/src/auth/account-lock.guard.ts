import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Injectable()
export class AccountLockGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.body?.userId || request.user?.id;
    if (!userId) return true;
    if (this.authService.isAccountLocked(userId)) {
      throw new ForbiddenException("Account is locked due to repeated failed login attempts. Please try again later.");
    }
    return true;
  }
}
