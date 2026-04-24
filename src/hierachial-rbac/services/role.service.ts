import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Role } from '../entities/role.entity';
import { Permission } from '../entities/permission.entity';
import { User } from '../entities/user.entity';
import { RbacAuditService } from './rbac-audit.service';
import { RbacAuditAction } from '../entities/rbac-audit-log.entity';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto, AssignRolesToUserDto } from '../dto/role.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permRepo: Repository<Permission>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: RbacAuditService,
  ) {}

  async create(dto: CreateRoleDto, actorId: string): Promise<Role> {
    const existing = await this.roleRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Role '${dto.name}' already exists`);

    let parent: Role | null = null;
    if (dto.parentId) {
      parent = await this.roleRepo.findOne({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException(`Parent role '${dto.parentId}' not found`);
      await this.detectCircularInheritance(dto.parentId, null);
    }

    const role = this.roleRepo.create({ ...dto, parent });
    const saved = await this.roleRepo.save(role);

    await this.auditService.log({
      action: RbacAuditAction.ROLE_CREATED,
      actorId,
      targetRoleId: saved.id,
      newState: { name: saved.name },
    });

    return saved;
  }

  async findAll(): Promise<Role[]> {
    return this.roleRepo.find({ relations: ['permissions', 'parent', 'children'] });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id }, relations: ['permissions', 'parent', 'children'] });
    if (!role) throw new NotFoundException(`Role '${id}' not found`);
    return role;
  }

  async update(id: string, dto: UpdateRoleDto, actorId: string): Promise<Role> {
    const role = await this.findOne(id);
    const prev = { name: role.name, priority: role.priority };

    if (dto.name && role.isSystem) {
      throw new ForbiddenException('Cannot rename system roles');
    }

    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('Role cannot be its own parent');
      const parent = await this.roleRepo.findOne({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException(`Parent role '${dto.parentId}' not found`);
      await this.detectCircularInheritance(dto.parentId, id);
      role.parent = parent;
      role.parentId = dto.parentId;
    }

    Object.assign(role, dto);
    const saved = await this.roleRepo.save(role);

    await this.auditService.log({
      action: RbacAuditAction.ROLE_UPDATED,
      actorId,
      targetRoleId: id,
      previousState: prev,
      newState: dto,
    });

    return saved;
  }

  async remove(id: string, actorId: string): Promise<void> {
    const role = await this.findOne(id);
    if (role.isSystem) throw new ForbiddenException('Cannot delete system roles');

    await this.roleRepo.remove(role);

    await this.auditService.log({
      action: RbacAuditAction.ROLE_DELETED,
      actorId,
      targetRoleId: id,
      previousState: { name: role.name },
    });
  }

  async assignPermissions(id: string, dto: AssignPermissionsDto, actorId: string): Promise<Role> {
    const role = await this.findOne(id);
    const perms = await this.permRepo.findBy({ id: In(dto.permissionIds) });

    if (perms.length !== dto.permissionIds.length) {
      throw new NotFoundException('One or more permission IDs not found');
    }

    role.permissions = dto.replace ? perms : [...(role.permissions ?? []), ...perms];
    const saved = await this.roleRepo.save(role);

    await this.auditService.log({
      action: RbacAuditAction.ROLE_PERMISSION_ASSIGNED,
      actorId,
      targetRoleId: id,
      newState: { permissionIds: dto.permissionIds },
    });

    return saved;
  }

  async revokePermissions(id: string, permissionIds: string[], actorId: string): Promise<Role> {
    const role = await this.findOne(id);
    role.permissions = (role.permissions ?? []).filter((p) => !permissionIds.includes(p.id));
    const saved = await this.roleRepo.save(role);

    await this.auditService.log({
      action: RbacAuditAction.ROLE_PERMISSION_REVOKED,
      actorId,
      targetRoleId: id,
      metadata: { permissionIds },
    });

    return saved;
  }

  async assignRolesToUser(dto: AssignRolesToUserDto, actorId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: dto.userId }, relations: ['roles'] });
    if (!user) throw new NotFoundException(`User '${dto.userId}' not found`);

    const roles = await this.roleRepo.findBy({ id: In(dto.roleIds) });
    user.roles = [...(user.roles ?? []), ...roles];
    const saved = await this.userRepo.save(user);

    await this.auditService.log({
      action: RbacAuditAction.USER_ROLE_ASSIGNED,
      actorId,
      targetUserId: dto.userId,
      newState: { roleIds: dto.roleIds },
    });

    return saved;
  }

  async revokeRolesFromUser(userId: string, roleIds: string[], actorId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['roles'] });
    if (!user) throw new NotFoundException(`User '${userId}' not found`);

    user.roles = (user.roles ?? []).filter((r) => !roleIds.includes(r.id));
    const saved = await this.userRepo.save(user);

    await this.auditService.log({
      action: RbacAuditAction.USER_ROLE_REVOKED,
      actorId,
      targetUserId: userId,
      metadata: { roleIds },
    });

    return saved;
  }

  /** Detects circular inheritance before creating/updating a role. */
  private async detectCircularInheritance(parentId: string, childId: string | null): Promise<void> {
    const visited = new Set<string>();
    let current: Role | null = await this.roleRepo.findOne({ where: { id: parentId }, relations: ['parent'] });

    while (current) {
      if (visited.has(current.id)) break;
      if (childId && current.id === childId) {
        throw new BadRequestException('Circular role inheritance detected');
      }
      visited.add(current.id);
      current = current.parent
        ? await this.roleRepo.findOne({ where: { id: current.parentId }, relations: ['parent'] })
        : null;
    }
  }
}
