import { Injectable, type CanActivate, type ExecutionContext, ForbiddenException } from "@nestjs/common"
import type { Reflector } from "@nestjs/core"
import type { CsrfService } from "../csrf.service"
import { CSRF_EXEMPT_KEY } from "../decorators/csrf-exempt.decorator"

@Injectable()
export class CsrfProtectionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private csrfService: CsrfService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if route is exempt from CSRF protection
    const isExempt = this.reflector.getAllAndOverride<boolean>(CSRF_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isExempt) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const method = request.method

    // Only protect state-changing methods
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return true
    }

    // Extract CSRF token
    const token =
      request.get("X-CSRF-Token") ||
      request.get("X-XSRF-Token") ||
      request.body?._csrf ||
      request.query._csrf ||
      request.cookies?.["XSRF-TOKEN"]

    if (!token) {
      throw new ForbiddenException("CSRF token not provided")
    }

    // Validate token
    const secret = request.session?.csrfSecret
    if (!secret) {
      throw new ForbiddenException("CSRF secret not found")
    }

    const isValid = this.csrfService.validateToken(token, secret)
    if (!isValid) {
      throw new ForbiddenException("Invalid CSRF token")
    }

    return true
  }
}
