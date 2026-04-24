import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import { RbacAuditLog, RbacAuditAction } from '../entities/rbac-audit-log.entity';

export interface LogAuditDto {
  action: RbacAuditAction;
  actorId?: string;
  targetUserId?: string;
  targetRoleId?: string;
  targetPermissionId?: string;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class RbacAuditService {
  private readonly logger = new Logger(RbacAuditService.name);

  constructor(
    @InjectRepository(RbacAuditLog)
    private readonly repo: Repository<RbacAuditLog>,
  ) {}

  async log(dto: LogAuditDto): Promise<RbacAuditLog | null> {
    try {
      const entry = this.repo.create(dto);
      return await this.repo.save(entry);
    } catch (err) {
      this.logger.error('Failed to write RBAC audit log', err);
      return null;
    }
  }

  async findAll(opts: { take?: number; skip?: number } = {}): Promise<{ data: RbacAuditLog[]; total: number }> {
    const options: FindManyOptions<RbacAuditLog> = {
      order: { createdAt: 'DESC' },
      take: opts.take ?? 50,
      skip: opts.skip ?? 0,
    };
    const [data, total] = await this.repo.findAndCount(options);
    return { data, total };
  }

  async findByActor(actorId: string): Promise<RbacAuditLog[]> {
    return this.repo.find({ where: { actorId }, order: { createdAt: 'DESC' } });
  }

  async findByTargetUser(targetUserId: string): Promise<RbacAuditLog[]> {
    return this.repo.find({ where: { targetUserId }, order: { createdAt: 'DESC' } });
  }
}
