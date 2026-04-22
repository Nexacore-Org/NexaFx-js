import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere, Like } from 'typeorm';
import { AdminAuditLogEntity, ActorType } from './entities/admin-audit-log.entity';
import { CreateAdminAuditLogDto } from './dto/create-admin-audit-log.dto';
import { AdminAuditLogFilterDto } from './dto/admin-audit-log-filter.dto';

export interface AuditContext {
  actorId: string;
  actorType: ActorType;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface AuthAuditData {
  userId: string;
  email?: string;
  action: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'PASSWORD_RESET' | 'PASSWORD_RESET_COMPLETED' | '2FA_ENABLED' | '2FA_DISABLED' | 'EMAIL_VERIFIED';
  success: boolean;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface FinancialAuditData {
  userId: string;
  action: 'TRANSACTION_CREATED' | 'TRANSACTION_UPDATED' | 'TRANSACTION_REVERSED' | 'FX_CONVERSION' | 'WALLET_DEBIT' | 'WALLET_CREDIT';
  entityId: string;
  entityType: 'Transaction' | 'FXConversion' | 'Wallet';
  amount?: number;
  currency?: string;
  beforeSnapshot?: Record<string, any>;
  afterSnapshot?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface AdminAuditData {
  action: string;
  entity: string;
  entityId?: string;
  beforeSnapshot?: Record<string, any>;
  afterSnapshot?: Record<string, any>;
  description?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(
    @InjectRepository(AdminAuditLogEntity)
    private readonly auditLogRepository: Repository<AdminAuditLogEntity>,
  ) {}

  async logAction(dto: CreateAdminAuditLogDto): Promise<AdminAuditLogEntity> {
    try {
      const log = this.auditLogRepository.create(dto);
      return await this.auditLogRepository.save(log);
    } catch (error) {
      this.logger.error(`Failed to log audit action: ${error.message}`, error.stack);
      // Never block the primary operation due to audit logging failure
      throw error;
    }
  }

  async logAuthEvent(context: AuditContext, data: AuthAuditData): Promise<void> {
    try {
      await this.logAction({
        actorId: context.actorId,
        actorType: context.actorType,
        action: data.action,
        entity: 'User',
        entityId: data.userId,
        ip: context.ip,
        userAgent: context.userAgent,
        description: this.getAuthDescription(data),
        metadata: {
          ...data.metadata,
          email: data.email,
          success: data.success,
          reason: data.reason,
          requestId: context.requestId,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log auth event: ${error.message}`, error.stack);
      // Never block primary operation
    }
  }

  async logFinancialEvent(context: AuditContext, data: FinancialAuditData): Promise<void> {
    try {
      await this.logAction({
        actorId: context.actorId,
        actorType: context.actorType,
        action: data.action,
        entity: data.entityType,
        entityId: data.entityId,
        ip: context.ip,
        userAgent: context.userAgent,
        beforeSnapshot: data.beforeSnapshot,
        afterSnapshot: data.afterSnapshot,
        description: this.getFinancialDescription(data),
        metadata: {
          ...data.metadata,
          amount: data.amount,
          currency: data.currency,
          requestId: context.requestId,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log financial event: ${error.message}`, error.stack);
      // Never block primary operation
    }
  }

  async logAdminAction(context: AuditContext, data: AdminAuditData): Promise<void> {
    try {
      await this.logAction({
        actorId: context.actorId,
        actorType: ActorType.ADMIN,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        ip: context.ip,
        userAgent: context.userAgent,
        beforeSnapshot: data.beforeSnapshot,
        afterSnapshot: data.afterSnapshot,
        description: data.description,
        metadata: {
          ...data.metadata,
          requestId: context.requestId,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log admin action: ${error.message}`, error.stack);
      // Never block primary operation
    }
  }

  async logSystemEvent(action: string, entity: string, description: string, metadata?: Record<string, any>): Promise<void> {
    try {
      await this.logAction({
        actorId: 'system',
        actorType: ActorType.SYSTEM,
        action,
        entity,
        description,
        metadata,
      });
    } catch (error) {
      this.logger.error(`Failed to log system event: ${error.message}`, error.stack);
      // Never block primary operation
    }
  }

  private getAuthDescription(data: AuthAuditData): string {
    const descriptions = {
      LOGIN: data.success ? 'User logged in successfully' : 'Login attempt failed',
      LOGOUT: 'User logged out',
      LOGIN_FAILED: `Login failed: ${data.reason || 'Invalid credentials'}`,
      PASSWORD_RESET: 'Password reset requested',
      PASSWORD_RESET_COMPLETED: 'Password reset completed successfully',
      '2FA_ENABLED': 'Two-factor authentication enabled',
      '2FA_DISABLED': 'Two-factor authentication disabled',
      EMAIL_VERIFIED: 'Email address verified successfully',
    };
    return descriptions[data.action] || `Auth action: ${data.action}`;
  }

  private getFinancialDescription(data: FinancialAuditData): string {
    const descriptions = {
      TRANSACTION_CREATED: `Transaction created: ${data.amount} ${data.currency}`,
      TRANSACTION_UPDATED: 'Transaction details updated',
      TRANSACTION_REVERSED: `Transaction reversed: ${data.amount} ${data.currency}`,
      FX_CONVERSION: `FX conversion: ${data.amount} ${data.currency}`,
      WALLET_DEBIT: `Wallet debited: ${data.amount} ${data.currency}`,
      WALLET_CREDIT: `Wallet credited: ${data.amount} ${data.currency}`,
    };
    return descriptions[data.action] || `Financial action: ${data.action}`;
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

  async findByEntity(entity: string, entityId: string, limit = 50) {
    return this.auditLogRepository.find({
      where: { entity, entityId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findByActor(actorId: string, limit = 100) {
    return this.auditLogRepository.find({
      where: { actorId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async search(query: string, limit = 20) {
    return this.auditLogRepository.find({
      where: [
        { action: Like(`%${query}%`) },
        { entity: Like(`%${query}%`) },
        { description: Like(`%${query}%`) },
      ],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
