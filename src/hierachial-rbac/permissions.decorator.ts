import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { PermissionAction, PermissionResource } from '../entities/permission.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

export const PERMISSIONS_KEY = 'permissions';
export const POLICY_KEY = 'policy';

export interface PermissionRequirement {
  action: PermissionAction;
  resource: PermissionResource;
  scope?: string;
  /** ALL = every permission required; ANY = at least one required */
  operator?: 'ALL' | 'ANY';
}

export interface PolicyRequirement {
  name: string;
  context?: Record<string, any>;
}

/**
 * Declare required permissions on a route handler.
 *
 * @example
 *   @Permissions({ action: PermissionAction.READ, resource: PermissionResource.USER })
 *   @Permissions(
 *     { action: PermissionAction.CREATE, resource: PermissionResource.WALLET },
 *     { action: PermissionAction.READ, resource: PermissionResource.TOKEN, scope: 'currency:USD' }
 *   )
 */
export const Permissions = (...permissions: PermissionRequirement[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Attach a named policy to a route handler.
 * Policies are evaluated by the PolicyEvaluatorService.
 */
export const Policy = (name: string, context?: Record<string, any>) =>
  SetMetadata(POLICY_KEY, { name, context } as PolicyRequirement);

/**
 * Convenience decorator that applies JWT guard + Permissions guard + declares permissions.
 *
 * @example
 *   @RequirePermissions({ action: PermissionAction.DELETE, resource: PermissionResource.USER })
 */
export const RequirePermissions = (...permissions: PermissionRequirement[]) =>
  applyDecorators(
    UseGuards(JwtAuthGuard, PermissionsGuard),
    SetMetadata(PERMISSIONS_KEY, permissions),
  );

/**
 * Shorthand decorator for common patterns.
 */
export const CanCreate = (resource: PermissionResource, scope?: string) =>
  RequirePermissions({ action: PermissionAction.CREATE, resource, scope });

export const CanRead = (resource: PermissionResource, scope?: string) =>
  RequirePermissions({ action: PermissionAction.READ, resource, scope });

export const CanUpdate = (resource: PermissionResource, scope?: string) =>
  RequirePermissions({ action: PermissionAction.UPDATE, resource, scope });

export const CanDelete = (resource: PermissionResource, scope?: string) =>
  RequirePermissions({ action: PermissionAction.DELETE, resource, scope });

export const CanManage = (resource: PermissionResource, scope?: string) =>
  RequirePermissions({ action: PermissionAction.MANAGE, resource, scope });
