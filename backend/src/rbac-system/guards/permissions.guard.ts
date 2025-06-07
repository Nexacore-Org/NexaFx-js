import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common"
import type { Reflector } from "@nestjs/core"
import type { RbacService } from "../services/rbac.service"
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator"

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredPermissions) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const user = request.user

    if (!user || !user.id) {
      return false
    }

    return this.rbacService.checkUserPermissions(user.id, requiredPermissions)
  }
}
