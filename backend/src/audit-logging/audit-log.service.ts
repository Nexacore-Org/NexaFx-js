import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Between, Like } from 'typeorm';
import { AuditLog, AuditActionType } from './audit-log.entity';
import { CreateAuditLogDto, QueryAuditLogsDto, PaginatedAuditLogsResponseDto } from './audit-log.dto';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async createLog(createAuditLogDto: CreateAuditLogDto): Promise<AuditLog> {
    try {
      const auditLog = this.auditLogRepository.create(createAuditLogDto);
      const savedLog = await this.auditLogRepository.save(auditLog);
      
      this.logger.log(`Audit log created: ${createAuditLogDto.actionType} by user ${createAuditLogDto.userId}`);
      
      return savedLog;
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`, error.stack);
      throw error;
    }
  }

  async logUserAction(
    actionType: AuditActionType,
    userId: string,
    options: {
      userEmail?: string;
      description?: string;
      metadata?: Record<string, any>;
      ipAddress?: string;
      userAgent?: string;
      resourceId?: string;
      resourceType?: string;
    } = {},
  ): Promise<AuditLog> {
    const createDto: CreateAuditLogDto = {
      actionType,
      userId,
      ...options,
    };

    return this.createLog(createDto);
  }

  async findAll(queryDto: QueryAuditLogsDto): Promise<PaginatedAuditLogsResponseDto> {
    const {
      actionType,
      userId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      search,
    } = queryDto;

    const options: FindManyOptions<AuditLog> = {};
    const where: any = {};

    // Apply filters
    if (actionType) {
      where.actionType = actionType;
    }

    if (userId) {
      where.userId = userId;
    }

    if (startDate && endDate) {
      where.timestamp = Between(new Date(startDate), new Date(endDate));
    } else if (startDate) {
      where.timestamp = Between(new Date(startDate), new Date());
    } else if (endDate) {
      where.timestamp = Between(new Date('1970-01-01'), new Date(endDate));
    }

    if (search) {
      where.description = Like(`%${search}%`);
    }

    options.where = where;
    options.order = { timestamp: 'DESC' };
    options.skip = (page - 1) * limit;
    options.take = limit;

    try {
      const [data, total] = await this.auditLogRepository.findAndCount(options);
      
      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(`Failed to query audit logs: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findByUserId(userId: string, limit: number = 50): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { userId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async getStatistics(): Promise<any> {
    const query = this.auditLogRepository
      .createQueryBuilder('audit_log')
      .select('audit_log.actionType', 'actionType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit_log.actionType');

    const actionStats = await query.getRawMany();

    const totalLogs = await this.auditLogRepository.count();
    
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);
    
    const recentLogs = await this.auditLogRepository.count({
      where: {
        timestamp: Between(last24Hours, new Date()),
      },
    });

    return {
      totalLogs,
      recentLogs,
      actionStats: actionStats.map(stat => ({
        actionType: stat.actionType,
        count: parseInt(stat.count),
      })),
    };
  }

  async deleteOldLogs(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.auditLogRepository
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(`Deleted ${result.affected} old audit logs (older than ${daysToKeep} days)`);
    
    return result.affected || 0;
  }
}

