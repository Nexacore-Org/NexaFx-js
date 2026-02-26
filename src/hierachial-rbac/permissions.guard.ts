import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  POLICY_KEY,
  PermissionRequirement,
  PolicyRequirement,
} from '../decorators/permissions.decorator';
import { PermissionResolutionService } from '../policies/permission-resolution.service';
import { PolicyEvaluatorService, PolicyContext } from '../policies/policy-evaluator.service';
import { RbacAuditService } from '../services/rbac-audit.service';
import { RbacAuditAction } from '../entities/rbac-audit-log.entity';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly permissionResolution: PermissionResolutionService,
    private readonly policyEvaluator: PolicyEvaluatorService,
    private readonly auditService: RbacAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirements = this.reflector.getAllAndOverride<PermissionRequirement[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const policyRequirement = this.reflector.getAllAndOverride<PolicyRequirement>(
      POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No restrictions defined — allow
    if (!requirements?.length && !policyRequirement) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.id) {
      throw new ForbiddenException('No authenticated user found');
    }

    const operator = requirements?.[0]?.operator ?? 'ALL';
    let permissionsOk = true;

    if (requirements?.length) {
      permissionsOk = await this.permissionResolution.hasPermissions(
        user.id,
        requirements,
        operator,
      );
    }

    let policyOk = true;
    if (policyRequirement) {
      const policyContext: PolicyContext = {
        user,
        resource: request.params,
        request,
        extra: policyRequirement.context,
      };
      policyOk = await this.policyEvaluator.evaluate(policyRequirement.name, policyContext);
    }

    const allowed = permissionsOk && policyOk;

    // Fire-and-forget audit log
    this.auditService
      .log({
        action: allowed ? RbacAuditAction.ACCESS_GRANTED : RbacAuditAction.ACCESS_DENIED,
        actorId: user.id,
        metadata: {
          requirements,
          policy: policyRequirement?.name,
          path: request.url,
          method: request.method,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      })
      .catch((err) => this.logger.error('Audit log failed', err));

    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
