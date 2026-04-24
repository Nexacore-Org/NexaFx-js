import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { PermissionAction, PermissionResource } from './permission.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';

export const PERMISSIONS_KEY = 'permissions';
export const POLICY_KEY = 'policy';

export interface PermissionRequirement {
  action: PermissionAction;
  resource: PermissionResource;
  scope?: string;
  operator?: 'ALL' | 'ANY';
}

export interface PolicyRequirement {
  name: string;
  context?: Record<string, any>;
}

export const Permissions = (...permissions: PermissionRequirement[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const Policy = (name: string, context?: Record<string, any>) =>
  SetMetadata(POLICY_KEY, { name, context } as PolicyRequirement);

export const RequirePermissions = (...permissions: PermissionRequirement[]) =>
  applyDecorators(
    UseGuards(JwtAuthGuard, PermissionsGuard),
    SetMetadata(PERMISSIONS_KEY, permissions),
  );

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
