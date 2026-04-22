import { 
  Controller, 
  Get, 
  Query, 
  UseGuards, 
  Param, 
  ParseUUIDPipe,
  ValidationPipe,
  HttpStatus,
  HttpCode
} from '@nestjs/common';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditLogFilterDto } from './dto/admin-audit-log-filter.dto';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ActorType } from './entities/admin-audit-log.entity';

@Controller('admin/audit')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private readonly adminAuditService: AdminAuditService) {}

  @Get('logs')
  async getAuditLogs(@Query(ValidationPipe) filters: AdminAuditLogFilterDto) {
    return this.adminAuditService.findAll(filters);
  }

  @Get('logs/entity/:entity/:entityId')
  async getEntityAuditLogs(
    @Param('entity') entity: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Query('limit') limit?: number,
  ) {
    return this.adminAuditService.findByEntity(entity, entityId, limit);
  }

  @Get('logs/actor/:actorId')
  async getActorAuditLogs(
    @Param('actorId', ParseUUIDPipe) actorId: string,
    @Query('limit') limit?: number,
  ) {
    return this.adminAuditService.findByActor(actorId, limit);
  }

  @Get('logs/search')
  async searchAuditLogs(@Query('q') query: string, @Query('limit') limit?: number) {
    if (!query || query.trim().length < 2) {
      return {
        items: [],
        total: 0,
        message: 'Search query must be at least 2 characters long',
      };
    }

    return {
      items: await this.adminAuditService.search(query.trim(), limit),
      total: 0, // We don't have count for search, can be added later
      query: query.trim(),
    };
  }

  @Get('stats')
  async getAuditStats(@Query('days') days?: number) {
    const daysToAnalyze = days && days > 0 && days <= 365 ? days : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToAnalyze);

    const filters: AdminAuditLogFilterDto = {
      startDate: startDate.toISOString(),
      endDate: new Date().toISOString(),
      limit: 10000, // Get all records for analysis
    };

    const allLogs = await this.adminAuditService.findAll(filters);
    const logs = allLogs.items;

    // Calculate statistics
    const stats = {
      totalLogs: logs.length,
      dateRange: {
        start: startDate.toISOString(),
        end: new Date().toISOString(),
        days: daysToAnalyze,
      },
      actorStats: this.calculateActorStats(logs),
      actionStats: this.calculateActionStats(logs),
      entityStats: this.calculateEntityStats(logs),
      hourlyDistribution: this.calculateHourlyDistribution(logs),
      recentActivity: logs.slice(0, 10), // Most recent 10 activities
    };

    return stats;
  }

  @Get('export')
  @HttpCode(HttpStatus.OK)
  async exportAuditLogs(@Query(ValidationPipe) filters: AdminAuditLogFilterDto) {
    const result = await this.adminAuditService.findAll({
      ...filters,
      limit: Math.min(filters.limit || 1000, 10000), // Cap at 10k for export
    });

    // Transform for export (remove sensitive data if needed)
    const exportData = result.items.map(log => ({
      id: log.id,
      actorId: log.actorId,
      actorType: log.actorType,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      description: log.description,
      ip: log.ip,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
      // Include metadata but sanitize sensitive fields
      metadata: this.sanitizeMetadata(log.metadata),
    }));

    return {
      data: exportData,
      total: result.total,
      exportedAt: new Date().toISOString(),
      filters,
    };
  }

  private calculateActorStats(logs: any[]) {
    const actorCounts = logs.reduce((acc, log) => {
      const key = `${log.actorType}:${log.actorId}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(actorCounts)
      .map(([actor, count]) => {
        const [type, id] = actor.split(':');
        return { actorType: type, actorId: id, count: count as number };
      })
      .sort((a, b) => (b.count as number) - (a.count as number))
      .slice(0, 10); // Top 10 actors
  }

  private calculateActionStats(logs: any[]) {
    const actionCounts = logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(actionCounts)
      .map(([action, count]) => ({ action, count: count as number }))
      .sort((a, b) => (b.count as number) - (a.count as number));
  }

  private calculateEntityStats(logs: any[]) {
    const entityCounts = logs.reduce((acc, log) => {
      if (log.entity) {
        acc[log.entity] = (acc[log.entity] || 0) + 1;
      }
      return acc;
    }, {});

    return Object.entries(entityCounts)
      .map(([entity, count]) => ({ entity, count: count as number }))
      .sort((a, b) => (b.count as number) - (a.count as number));
  }

  private calculateHourlyDistribution(logs: any[]) {
    const hourlyCounts = new Array(24).fill(0);
    
    logs.forEach(log => {
      const hour = new Date(log.createdAt).getHours();
      hourlyCounts[hour]++;
    });

    return hourlyCounts.map((count, hour) => ({
      hour,
      count,
      label: `${hour.toString().padStart(2, '0')}:00`,
    }));
  }

  private sanitizeMetadata(metadata: any): any {
    if (!metadata) return null;
    
    const sanitized = { ...metadata };
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'apiKey', 'ssn'];
    
    const sanitizeValue = (value: any): any => {
      if (typeof value !== 'object' || value === null) {
        return value;
      }
      
      if (Array.isArray(value)) {
        return value.map(sanitizeValue);
      }
      
      const result: any = {};
      for (const [key, val] of Object.entries(value)) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          result[key] = '***';
        } else {
          result[key] = sanitizeValue(val);
        }
      }
      return result;
    };
    
    return sanitizeValue(sanitized);
  }
}
