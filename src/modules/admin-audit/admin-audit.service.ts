import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere, Like } from 'typeorm';
import { AdminAuditLogEntity } from './entities/admin-audit-log.entity';
import { CreateAdminAuditLogDto } from './dto/create-admin-audit-log.dto';
import { AdminAuditLogFilterDto } from './dto/admin-audit-log-filter.dto';

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectRepository(AdminAuditLogEntity)
    private readonly auditLogRepository: Repository<AdminAuditLogEntity>,
  ) {}

  async logAction(dto: CreateAdminAuditLogDto): Promise<AdminAuditLogEntity> {
    const log = this.auditLogRepository.create(dto);
    return this.auditLogRepository.save(log);
  }

  async findAll(filters: AdminAuditLogFilterDto) {
    const where: FindOptionsWhere<AdminAuditLogEntity> = {};

    if (filters.actorId) {
      where.actorId = filters.actorId;
    }

    if (filters.actorType) {
      where.actorType = filters.actorType;
    }

    if (filters.entity) {
      where.entity = filters.entity;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.startDate && filters.endDate) {
      where.createdAt = Between(
        new Date(filters.startDate),
        new Date(filters.endDate),
      );
    }

    const take = filters.limit || 20;
    const skip = filters.offset || 0;

    const [items, total] = await this.auditLogRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return {
      items,
      total,
      limit: take,
      offset: skip,
    };
  }
}
