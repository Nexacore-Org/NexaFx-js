import { Injectable, Logger, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../role.entity';
import { Permission } from '../permission.entity';
import { User } from './entities/user.entity';
import { RbacAuditLog } from './entities/rbac-audit-log.entity';
import { RbacAuditService } from './rbac-audit.service';
import {
  CreateRoleDto,
  UpdateRoleDto,
  AssignPermissionsDto,
  AssignRolesToUserDto,
} from '../dto/role.dto';

@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permRepo: Repository<Permission>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: RbacAuditService,
  ) {}

  /**
   * Create a new role with circular inheritance detection
   */
  async create(dto: CreateRoleDto, actorId: string): Promise<Role> {
    // Check if name already exists
    const existing = await this.roleRepo.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Role name '${dto.name}' already exists`);
    }

    // Validate parent if provided
    if (dto.parentId) {
      await this.detectCircularInheritance(null, dto.parentId);
    }

    const parent = dto.parentId
      ? await this.roleRepo.findOne({ where: { id: dto.parentId } })
      : null;

    if (dto.parentId && !parent) {
      throw new NotFoundException(`Parent role ${dto.parentId} not found`);
    }

    const role = this.roleRepo.create({
      name: dto.name,
      description: dto.description,
      priority: dto.priority || 0,
      parent,
      parentId: dto.parentId,
    });

    const saved = await this.roleRepo.save(role);

    // Assign permissions if provided
    if (dto.permissionIds && dto.permissionIds.length > 0) {
      await this.assignPermissions(saved.id, { permissionIds: dto.permissionIds }, actorId);
    }

    await this.auditService.log({
      action: 'ROLE_CREATED',
      actorId,
      targetRoleId: saved.id,
      newState: { name: saved.name, parentId: saved.parentId },
    });

    this.logger.log(`Role created: ${saved.name} by ${actorId}`);
    return saved;
  }

  /**
   * Find all roles
   */
  async findAll(): Promise<Role[]> {
    return this.roleRepo.find({
      order: { priority: 'DESC', name: 'ASC' },
    });
  }

  /**
   * Find one role by ID
   */
  async findOne(id: string): Promise<Role> {
    const role = await this.roleRepo.findOne({
      where: { id },
      relations: ['parent', 'permissions'],
    });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    return role;
  }

  /**
   * Update a role with inheritance revalidation
   */
  async update(id: string, dto: UpdateRoleDto, actorId: string): Promise<Role> {
    const role = await this.findOne(id);

    // System roles cannot have their name changed
    if (role.isSystem && dto.name && dto.name !== role.name) {
      throw new ForbiddenException('Cannot modify name of system role');
    }

    // Validate parent change
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('Role cannot be its own parent');
      }
      await this.detectCircularInheritance(id, dto.parentId);
    }

    const oldState = { name: role.name, priority: role.priority, parentId: role.parentId };

    if (dto.name) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.priority !== undefined) role.priority = dto.priority;
    if (dto.parentId !== undefined) {
      role.parentId = dto.parentId;
      if (dto.parentId) {
        role.parent = await this.roleRepo.findOne({ where: { id: dto.parentId } });
      } else {
        role.parent = null;
      }
    }

    const saved = await this.roleRepo.save(role);

    await this.auditService.log({
      action: 'ROLE_UPDATED',
      actorId,
      targetRoleId: saved.id,
      oldState,
      newState: { name: saved.name, priority: saved.priority, parentId: saved.parentId },
    });

    this.logger.log(`Role updated: ${saved.name} by ${actorId}`);
    return saved;
  }

  /**
   * Delete a role and cascade to user-role assignments
   */
  async remove(id: string, actorId: string): Promise<void> {
    const role = await this.findOne(id);

    if (role.isSystem) {
      throw new ForbiddenException('Cannot delete system role');
    }

    // Remove role from all users
    const usersWithRole = await this.userRepo
      .createQueryBuilder('user')
      .leftJoin('user.roles', 'role')
      .where('role.id = :id', { id })
      .getMany();

    for (const user of usersWithRole) {
      user.roles = user.roles.filter(r => r.id !== id);
      await this.userRepo.save(user);
    }

    await this.auditService.log({
      action: 'ROLE_DELETED',
      actorId,
      targetRoleId: id,
      oldState: { name: role.name },
    });

    await this.roleRepo.remove(role);
    this.logger.log(`Role deleted: ${role.name} by ${actorId}`);
  }

  /**
   * Assign permissions to a role
   */
  async assignPermissions(id: string, dto: AssignPermissionsDto, actorId: string): Promise<Role> {
    const role = await this.roleRepo.findOne({
      where: { id },
      relations: ['permissions'],
    });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    const permissions = await this.permRepo.findByIds(dto.permissionIds);
    if (permissions.length !== dto.permissionIds.length) {
      throw new NotFoundException('One or more permissions not found');
    }

    if (dto.replace) {
      role.permissions = permissions;
    } else {
      // Append permissions (no duplicates)
      const existingIds = new Set(role.permissions.map(p => p.id));
      const newPerms = permissions.filter(p => !existingIds.has(p.id));
      role.permissions = [...role.permissions, ...newPerms];
    }

    const saved = await this.roleRepo.save(role);

    await this.auditService.log({
      action: 'PERMISSIONS_ASSIGNED',
      actorId,
      targetRoleId: id,
      newState: { permissionCount: saved.permissions.length },
    });

    return saved;
  }

  /**
   * Revoke permissions from a role
   */
  async revokePermissions(id: string, permissionIds: string[], actorId: string): Promise<Role> {
    const role = await this.roleRepo.findOne({
      where: { id },
      relations: ['permissions'],
    });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    role.permissions = role.permissions.filter(p => !permissionIds.includes(p.id));
    const saved = await this.roleRepo.save(role);

    await this.auditService.log({
      action: 'PERMISSIONS_REVOKED',
      actorId,
      targetRoleId: id,
      oldState: { removedPermissionIds: permissionIds },
    });

    return saved;
  }

  /**
   * Assign roles to a user
   */
  async assignRolesToUser(dto: AssignRolesToUserDto, actorId: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: dto.userId },
      relations: ['roles'],
    });
    if (!user) {
      throw new NotFoundException(`User ${dto.userId} not found`);
    }

    const roles = await this.roleRepo.findByIds(dto.roleIds);
    if (roles.length !== dto.roleIds.length) {
      throw new NotFoundException('One or more roles not found');
    }

    // Add roles (no duplicates)
    const existingRoleIds = new Set(user.roles.map(r => r.id));
    const newRoles = roles.filter(r => !existingRoleIds.has(r.id));
    user.roles = [...user.roles, ...newRoles];

    const saved = await this.userRepo.save(user);

    await this.auditService.log({
      action: 'USER_ROLES_ASSIGNED',
      actorId,
      targetUserId: dto.userId,
      newState: { roleIds: dto.roleIds },
    });

    return saved;
  }

  /**
   * Revoke roles from a user
   */
  async revokeRolesFromUser(userId: string, roleIds: string[], actorId: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles'],
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    user.roles = user.roles.filter(r => !roleIds.includes(r.id));
    const saved = await this.userRepo.save(user);

    await this.auditService.log({
      action: 'USER_ROLES_REVOKED',
      actorId,
      targetUserId: userId,
      oldState: { removedRoleIds: roleIds },
    });

    return saved;
  }

  /**
   * Build inheritance chain for a role
   */
  async buildInheritanceChain(roleId: string): Promise<string[]> {
    const chain: string[] = [];
    let currentId = roleId;

    while (currentId) {
      const role = await this.roleRepo.findOne({ where: { id: currentId } });
      if (!role) break;
      chain.push(role.name);
      currentId = role.parentId;
    }

    return chain;
  }

  /**
   * Compute permission diff without modifying state
   */
  async computePermissionDiff(roleId: string, newParentId?: string): Promise<any> {
    const role = await this.roleRepo.findOne({
      where: { id: roleId },
      relations: ['permissions', 'parent'],
    });
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    const currentPermissions = await this.resolvePermissions(role);

    if (newParentId) {
      const newParent = await this.roleRepo.findOne({
        where: { id: newParentId },
        relations: ['permissions'],
      });
      if (!newParent) {
        throw new NotFoundException(`Parent role ${newParentId} not found`);
      }

      // Simulate new permission set without modifying state
      const simulatedRole = { ...role, parent: newParent, parentId: newParentId };
      const newPermissions = await this.resolvePermissions(simulatedRole as Role);

      return {
        roleId,
        currentPermissions,
        newPermissions,
        added: newPermissions.filter(p => !currentPermissions.includes(p)),
        removed: currentPermissions.filter(p => !newPermissions.includes(p)),
      };
    }

    return { roleId, currentPermissions };
  }

  /**
   * Detect circular inheritance using DFS
   */
  private async detectCircularInheritance(roleId: string | null, newParentId: string): Promise<void> {
    let currentParentId = newParentId;
    const visited = new Set<string>();

    while (currentParentId) {
      if (roleId && currentParentId === roleId) {
        throw new BadRequestException('Circular inheritance detected');
      }
      if (visited.has(currentParentId)) break;
      visited.add(currentParentId);

      const parent = await this.roleRepo.findOne({ where: { id: currentParentId } });
      currentParentId = parent?.parentId;
    }
  }

  /**
   * Resolve all permissions for a role (including inherited)
   */
  private async resolvePermissions(role: Role): Promise<string[]> {
    const permissions = new Set<string>();
    let currentRole: Role | null = role;

    while (currentRole) {
      if (currentRole.permissions) {
        currentRole.permissions.forEach(p => permissions.add(p.id));
      }
      
      if (currentRole.parentId) {
        currentRole = await this.roleRepo.findOne({
          where: { id: currentRole.parentId },
          relations: ['permissions'],
        });
      } else {
        break;
      }
    }

    return Array.from(permissions);
  }
}
