import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common"
import type { Reflector } from "@nestjs/core"

@Injectable()
export class CspConfigGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // This guard can be used to apply different CSP configurations
    // based on route metadata
    const cspConfig = this.reflector.get<string>("cspConfig", context.getHandler())

    if (cspConfig) {
      const request = context.switchToHttp().getRequest()
      request.cspConfigOverride = cspConfig
    }

    return true
  }
}
