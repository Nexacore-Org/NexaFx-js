import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RbacAuditLog } from './entities/rbac-audit-log.entity';

export interface LogAuditDto {
  action: string;
  actorId: string;
  targetRoleId?: string;
  targetUserId?: string;
  oldState?: Record<string, any>;
  newState?: Record<string, any>;
  reason?: string;
}

@Injectable()
export class RbacAuditService {
  private readonly logger = new Logger(RbacAuditService.name);

  constructor(
    @InjectRepository(RbacAuditLog)
    private readonly repo: Repository<RbacAuditLog>,
  ) {}

  /**
   * Log an RBAC audit entry
   * Returns null on failure to avoid blocking the main operation
   */
  async log(dto: LogAuditDto): Promise<RbacAuditLog | null> {
    try {
      const entry = this.repo.create(dto);
      const saved = await this.repo.save(entry);
      this.logger.debug(`RBAC audit logged: ${dto.action} by ${dto.actorId}`);
      return saved;
    } catch (error) {
      this.logger.error(`Failed to log RBAC audit: ${error.message}`);
      return null; // Don't fail operation if audit logging fails
    }
  }

  /**
   * Find all audit logs with pagination
   */
  async findAll(options?: { take?: number; skip?: number }): Promise<[RbacAuditLog[], number]> {
    return this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      take: options?.take ?? 50,
      skip: options?.skip ?? 0,
    });
  }

  /**
   * Find audit logs by actor
   */
  async findByActor(actorId: string): Promise<RbacAuditLog[]> {
    return this.repo.find({
      where: { actorId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find audit logs by target user
   */
  async findByTargetUser(userId: string): Promise<RbacAuditLog[]> {
    return this.repo.find({
      where: { targetUserId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find audit logs by target role
   */
  async findByTargetRole(roleId: string): Promise<RbacAuditLog[]> {
    return this.repo.find({
      where: { targetRoleId: roleId },
      order: { createdAt: 'DESC' },
    });
  }
}
