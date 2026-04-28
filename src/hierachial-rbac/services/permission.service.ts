import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../permission.entity';
import { RbacAuditService } from './rbac-audit.service';

export interface CreatePermissionDto {
  name: string;
  description?: string;
  action: string;
  resource: string;
  scope?: string;
  conditions?: Record<string, any>;
}

export interface UpdatePermissionDto {
  name?: string;
  description?: string;
  scope?: string;
  conditions?: Record<string, any>;
}

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    @InjectRepository(Permission)
    private readonly permRepo: Repository<Permission>,
    private readonly auditService: RbacAuditService,
  ) {}

  async create(dto: CreatePermissionDto, actorId: string): Promise<Permission> {
    const existing = await this.permRepo.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Permission name '${dto.name}' already exists`);
    }

    const permission = this.permRepo.create({
      name: dto.name,
      description: dto.description,
      action: dto.action as any,
      resource: dto.resource as any,
      scope: dto.scope,
      conditions: dto.conditions,
    });

    const saved = await this.permRepo.save(permission);

    await this.auditService.log({
      action: 'PERMISSION_CREATED',
      actorId,
      newState: { name: saved.name, action: saved.action, resource: saved.resource },
    });

    this.logger.log(`Permission created: ${saved.name} by ${actorId}`);
    return saved;
  }

  async findAll(): Promise<Permission[]> {
    return this.permRepo.find({
      order: { resource: 'ASC', action: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Permission> {
    const permission = await this.permRepo.findOne({ where: { id } });
    if (!permission) {
      throw new NotFoundException(`Permission ${id} not found`);
    }
    return permission;
  }

  async update(id: string, dto: UpdatePermissionDto, actorId: string): Promise<Permission> {
    const permission = await this.findOne(id);
    const oldState = { name: permission.name, scope: permission.scope };

    if (dto.name) permission.name = dto.name;
    if (dto.description !== undefined) permission.description = dto.description;
    if (dto.scope !== undefined) permission.scope = dto.scope;
    if (dto.conditions !== undefined) permission.conditions = dto.conditions;

    const saved = await this.permRepo.save(permission);

    await this.auditService.log({
      action: 'PERMISSION_UPDATED',
      actorId,
      targetRoleId: id,
      oldState,
      newState: { name: saved.name, scope: saved.scope },
    });

    return saved;
  }

  async remove(id: string, actorId: string): Promise<void> {
    const permission = await this.findOne(id);
    
    await this.auditService.log({
      action: 'PERMISSION_DELETED',
      actorId,
      oldState: { name: permission.name },
    });

    await this.permRepo.remove(permission);
    this.logger.log(`Permission deleted: ${permission.name} by ${actorId}`);
  }
}
