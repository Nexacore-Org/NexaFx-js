import { Injectable, type CanActivate, type ExecutionContext, ForbiddenException } from "@nestjs/common"
import type { SessionData } from "../../session/session.service"

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const session: SessionData = request.session

    if (!session) {
      throw new ForbiddenException("No session found")
    }

    // Check if user has admin role
    if (!session.roles?.includes("admin")) {
      throw new ForbiddenException("Admin access required for backup operations")
    }

    return true
  }
}
