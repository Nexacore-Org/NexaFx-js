import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './role.entity';
import { Permission, PermissionAction, PermissionResource } from './permission.entity';
import { User } from './entities/user.entity';
import { PermissionRequirement } from './permissions.decorator';
import { PermissionCacheService } from './permission-cache.service';

export interface ResolvedPermissions {
  permissions: Set<string>;
  roles: string[];
}

@Injectable()
export class PermissionResolutionService {
  private readonly logger = new Logger(PermissionResolutionService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly cache: PermissionCacheService,
  ) {}

  async resolveUserPermissions(userId: string): Promise<ResolvedPermissions> {
    // Check cache first
    const cached = this.cache.get(userId);
    if (cached) return cached;

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles'],
    });

    if (!user || !user.roles?.length) {
      return { permissions: new Set(), roles: [] };
    }

    const permissionKeys = new Set<string>();
    const roleNames: string[] = [];
    const visited = new Set<string>();

    for (const role of user.roles) {
      await this.collectPermissionsFromRole(role.id, permissionKeys, roleNames, visited);
    }

    const result = { permissions: permissionKeys, roles: roleNames };
    this.cache.set(userId, permissionKeys, roleNames);
    return result;
  }

  private async collectPermissionsFromRole(
    roleId: string,
    permissionKeys: Set<string>,
    roleNames: string[],
    visited: Set<string>,
  ): Promise<void> {
    if (visited.has(roleId)) return;
    visited.add(roleId);

    const role = await this.roleRepository.findOne({
      where: { id: roleId, isActive: true },
      relations: ['permissions', 'parent'],
    });

    if (!role) return;

    roleNames.push(role.name);

    for (const permission of role.permissions ?? []) {
      if (permission.isActive) {
        permissionKeys.add(permission.key);
        if (permission.action === PermissionAction.MANAGE) {
          this.expandManagePermission(permission.resource, permission.scope, permissionKeys);
        }
      }
    }

    if (role.parent) {
      await this.collectPermissionsFromRole(role.parent.id, permissionKeys, roleNames, visited);
    }
  }

  private expandManagePermission(
    resource: PermissionResource,
    scope: string | null,
    permissionKeys: Set<string>,
  ): void {
    const actions = Object.values(PermissionAction).filter((a) => a !== PermissionAction.MANAGE);
    for (const action of actions) {
      const key = scope ? `${action}:${resource}:${scope}` : `${action}:${resource}`;
      permissionKeys.add(key);
    }
    if (resource === PermissionResource.ALL) {
      for (const res of Object.values(PermissionResource)) {
        if (res !== PermissionResource.ALL) {
          for (const action of actions) {
            permissionKeys.add(`${action}:${res}`);
          }
        }
      }
    }
  }

  async hasPermissions(
    userId: string,
    requirements: PermissionRequirement[],
    operator: 'ALL' | 'ANY' = 'ALL',
  ): Promise<boolean> {
    const { permissions } = await this.resolveUserPermissions(userId);
    const check = (req: PermissionRequirement) => this.matchesRequirement(permissions, req);
    return operator === 'ANY' ? requirements.some(check) : requirements.every(check);
  }

  private matchesRequirement(userPermissions: Set<string>, req: PermissionRequirement): boolean {
    const { action, resource, scope } = req;
    const exactKey = scope ? `${action}:${resource}:${scope}` : `${action}:${resource}`;
    if (userPermissions.has(exactKey)) return true;

    const manageKey = scope
      ? `${PermissionAction.MANAGE}:${resource}:${scope}`
      : `${PermissionAction.MANAGE}:${resource}`;
    if (userPermissions.has(manageKey)) return true;
    if (userPermissions.has(`${PermissionAction.MANAGE}:${PermissionResource.ALL}`)) return true;
    if (userPermissions.has(`${action}:${PermissionResource.ALL}`)) return true;
    return false;
  }

  async getAllPermissions(): Promise<Permission[]> {
    return this.permissionRepository.find({ where: { isActive: true } });
  }

  async getRoleAncestors(roleId: string): Promise<Role[]> {
    const ancestors: Role[] = [];
    const visited = new Set<string>();
    let current = await this.roleRepository.findOne({ where: { id: roleId }, relations: ['parent'] });

    while (current?.parent && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = await this.roleRepository.findOne({
        where: { id: current.parentId },
        relations: ['parent'],
      });
      if (parent) ancestors.push(parent);
      current = parent;
    }

    return ancestors;
  }

  /** Invalidate cache for a user (call after role/permission changes). */
  invalidateCache(userId?: string): void {
    if (userId) {
      this.cache.invalidate(userId);
    } else {
      this.cache.invalidateAll();
    }
  }
}
