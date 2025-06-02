import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Permission } from './permission.entity';
import { Role } from '../roles/role.entity';
import { CreatePermissionDto, UpdatePermissionDto } from './permissions.dto';

interface FindAllOptions {
  page: number;
  limit: number;
  resource?: string;
  action?: string;
}

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private permissionsRepository: Repository<Permission>,
    @InjectRepository(Role)
    private rolesRepository: Repository<Role>,
  ) {}

  async findAll(options: FindAllOptions) {
    const { page, limit, resource, action } = options;
    const skip = (page - 1) * limit;
    
    const queryBuilder = this.permissionsRepository
      .createQueryBuilder('permission')
      .leftJoinAndSelect('permission.roles', 'roles');

    if (resource) {
      queryBuilder.andWhere('permission.resource = :resource', { resource });
    }

    if (action) {
      queryBuilder.andWhere('permission.action = :action', { action });
    }

    const [permissions, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: permissions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<Permission> {
    const permission = await this.permissionsRepository.findOne({
      where: { id },
      relations: ['roles'],
    });

    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }

    return permission;
  }

  async create(createPermissionDto: CreatePermissionDto): Promise<Permission> {
    // Check if permission with same name already exists
    const existingPermission = await this.permissionsRepository.findOne({
      where: { name: createPermissionDto.name },
    });

    if (existingPermission) {
      throw new ConflictException(`Permission with name '${createPermissionDto.name}' already exists`);
    }

    const permission = this.permissionsRepository.create({
      ...createPermissionDto,
      isActive: createPermissionDto.isActive ?? true,
    });

    return this.permissionsRepository.save(permission);
  }

  async update(id: string, updatePermissionDto: UpdatePermissionDto): Promise<Permission> {
    const permission = await this.findOne(id);

    // Check if updating name to existing name
    if (updatePermissionDto.name && updatePermissionDto.name !== permission.name) {
      const existingPermission = await this.permissionsRepository.findOne({
        where: { name: updatePermissionDto.name },
      });

      if (existingPermission) {
        throw new ConflictException(`Permission with name '${updatePermissionDto.name}' already exists`);
      }
    }

    Object.assign(permission, updatePermissionDto);
    return this.permissionsRepository.save(permission);
  }

  async remove(id: string): Promise<void> {
    const permission = await this.findOne(id);
    await this.permissionsRepository.remove(permission);
  }

  async linkRoles(permissionId: string, roleIds: string[]): Promise<Permission> {
    const permission = await this.findOne(permissionId);
    
    const roles = await this.rolesRepository.findByIds(roleIds);
    
    if (roles.length !== roleIds.length) {
      throw new NotFoundException('One or more roles not found');
    }

    // Add new roles to existing ones (avoid duplicates)
    const existingRoleIds = permission.roles.map(role => role.id);
    const newRoles = roles.filter(role => !existingRoleIds.includes(role.id));
    
    permission.roles = [...permission.roles, ...newRoles];
    
    return this.permissionsRepository.save(permission);
  }

  async unlinkRole(permissionId: string, roleId: string): Promise<void> {
    const permission = await this.findOne(permissionId);
    
    permission.roles = permission.roles.filter(role => role.id !== roleId);
    
    await this.permissionsRepository.save(permission);
  }

  async findByName(name: string): Promise<Permission | null> {
    return this.permissionsRepository.findOne({
      where: { name },
      relations: ['roles'],
    });
  }

  async checkUserHasPermission(userId: string, permissionName: string): Promise<boolean> {
    const query = `
      SELECT p.id 
      FROM permissions p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      INNER JOIN user_roles ur ON rp.role_id = ur.role_id
      WHERE ur.user_id = $1 AND p.name = $2 AND p.is_active = true
      LIMIT 1
    `;
    
    const result = await this.permissionsRepository.query(query, [userId, permissionName]);
    return result.length > 0;
  }
}