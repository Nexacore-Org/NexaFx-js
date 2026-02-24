import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../entities/role.entity';
import { Permission, PermissionAction, PermissionResource } from '../entities/permission.entity';
import { User } from '../entities/user.entity';
import { PermissionRequirement } from '../decorators/permissions.decorator';

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
  ) {}

  /**
   * Resolves ALL effective permissions for a user, walking up the role hierarchy.
   */
  async resolveUserPermissions(userId: string): Promise<ResolvedPermissions> {
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

    return { permissions: permissionKeys, roles: roleNames };
  }

  /**
   * Recursively collects permissions from a role and its ancestors.
   */
  private async collectPermissionsFromRole(
    roleId: string,
    permissionKeys: Set<string>,
    roleNames: string[],
    visited: Set<string>,
  ): Promise<void> {
    if (visited.has(roleId)) return; // Prevent cycles
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
        // MANAGE on a resource implies all other actions on that resource
        if (permission.action === PermissionAction.MANAGE) {
          this.expandManagePermission(permission.resource, permission.scope, permissionKeys);
        }
      }
    }

    // Walk up the hierarchy
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
    // Also handle wildcard resource
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

  /**
   * Evaluates whether a user has the required permissions.
   * Handles: exact match, MANAGE wildcard, ALL resource wildcard, scoped permissions.
   */
  async hasPermissions(
    userId: string,
    requirements: PermissionRequirement[],
    operator: 'ALL' | 'ANY' = 'ALL',
  ): Promise<boolean> {
    const { permissions } = await this.resolveUserPermissions(userId);

    const check = (req: PermissionRequirement): boolean => {
      return this.matchesRequirement(permissions, req);
    };

    if (operator === 'ANY') {
      return requirements.some(check);
    }
    return requirements.every(check);
  }

  private matchesRequirement(
    userPermissions: Set<string>,
    req: PermissionRequirement,
  ): boolean {
    const { action, resource, scope } = req;

    // 1. Exact match
    const exactKey = scope ? `${action}:${resource}:${scope}` : `${action}:${resource}`;
    if (userPermissions.has(exactKey)) return true;

    // 2. MANAGE on the same resource
    const manageKey = scope ? `${PermissionAction.MANAGE}:${resource}:${scope}` : `${PermissionAction.MANAGE}:${resource}`;
    if (userPermissions.has(manageKey)) return true;

    // 3. Global MANAGE (manage:*)
    if (userPermissions.has(`${PermissionAction.MANAGE}:${PermissionResource.ALL}`)) return true;

    // 4. Action on ALL resources: action:*
    if (userPermissions.has(`${action}:${PermissionResource.ALL}`)) return true;

    // 5. Already expanded by expandManagePermission during resolution
    return false;
  }

  /**
   * Gets flat list of all permissions in DB for building policy rules.
   */
  async getAllPermissions(): Promise<Permission[]> {
    return this.permissionRepository.find({ where: { isActive: true } });
  }

  /**
   * Resolves the full ancestry chain of a role (parent, grandparent, …).
   */
  async getRoleAncestors(roleId: string): Promise<Role[]> {
    const ancestors: Role[] = [];
    const visited = new Set<string>();
    let current = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['parent'],
    });

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
}
