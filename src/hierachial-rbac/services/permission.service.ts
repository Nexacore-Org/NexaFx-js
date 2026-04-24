import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../entities/permission.entity';
import { RbacAuditService } from './rbac-audit.service';
import { RbacAuditAction } from '../entities/rbac-audit-log.entity';
import { CreatePermissionDto, UpdatePermissionDto } from '../dto/permission.dto';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission)
    private readonly repo: Repository<Permission>,
    private readonly auditService: RbacAuditService,
  ) {}

  async create(dto: CreatePermissionDto, actorId: string): Promise<Permission> {
    const existing = await this.repo.findOne({
      where: { action: dto.action, resource: dto.resource, scope: dto.scope ?? null },
    });
    if (existing) throw new ConflictException('Permission with this action/resource/scope already exists');

    const perm = this.repo.create(dto);
    const saved = await this.repo.save(perm);

    await this.auditService.log({
      action: RbacAuditAction.PERMISSION_CREATED,
      actorId,
      targetPermissionId: saved.id,
      newState: dto,
    });

    return saved;
  }

  async findAll(): Promise<Permission[]> {
    return this.repo.find({ order: { resource: 'ASC', action: 'ASC' } });
  }

  async findOne(id: string): Promise<Permission> {
    const perm = await this.repo.findOne({ where: { id } });
    if (!perm) throw new NotFoundException(`Permission '${id}' not found`);
    return perm;
  }

  async update(id: string, dto: UpdatePermissionDto, actorId: string): Promise<Permission> {
    const perm = await this.findOne(id);
    const prev = { name: perm.name, isActive: perm.isActive };

    Object.assign(perm, dto);
    const saved = await this.repo.save(perm);

    await this.auditService.log({
      action: RbacAuditAction.PERMISSION_UPDATED,
      actorId,
      targetPermissionId: id,
      previousState: prev,
      newState: dto,
    });

    return saved;
  }

  async remove(id: string, actorId: string): Promise<void> {
    const perm = await this.findOne(id);
    await this.repo.remove(perm);

    await this.auditService.log({
      action: RbacAuditAction.PERMISSION_DELETED,
      actorId,
      targetPermissionId: id,
    });
  }
}
