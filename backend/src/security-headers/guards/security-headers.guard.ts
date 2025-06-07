import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common"
import type { Reflector } from "@nestjs/core"
import { SECURITY_HEADERS_KEY } from "../decorators/security-headers.decorator"
import type { Response } from "express"

@Injectable()
export class SecurityHeadersGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const securityConfig = this.reflector.getAllAndOverride(SECURITY_HEADERS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (securityConfig?.disabled) {
      return true
    }

    const response = context.switchToHttp().getResponse<Response>()

    // Apply route-specific security headers
    if (securityConfig?.csp?.directives) {
      const cspString = Object.entries(securityConfig.csp.directives)
        .map(([key, value]) => {
          const valueString = Array.isArray(value) ? value.join(" ") : value
          return `${key} ${valueString}`
        })
        .join("; ")

      response.setHeader("Content-Security-Policy", cspString)
    }

    if (securityConfig?.frameOptions) {
      response.setHeader("X-Frame-Options", securityConfig.frameOptions)
    }

    return true
  }
}
