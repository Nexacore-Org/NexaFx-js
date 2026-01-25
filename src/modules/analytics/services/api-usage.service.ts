import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThan } from 'typeorm';
import { ApiUsageLogEntity } from '../entities/api-usage-log.entity';

export interface LogMetricsDto {
  route: string;
  method: string;
  userId?: string;
  durationMs: number;
  statusCode: number;
  userAgent?: string;
  ipAddress?: string;
}

export interface ApiUsageSummary {
  totalRequests: number;
  averageResponseTime: number;
  requestsByRoute: {
    route: string;
    method: string;
    count: number;
    avgDuration: number;
  }[];
  requestsByStatusCode: {
    statusCode: number;
    count: number;
  }[];
  topUsers: {
    userId: string;
    requestCount: number;
  }[];
}

@Injectable()
export class ApiUsageService {
  private readonly logger = new Logger(ApiUsageService.name);

  constructor(
    @InjectRepository(ApiUsageLogEntity)
    private readonly usageRepo: Repository<ApiUsageLogEntity>,
  ) {}

  async logRequest(metrics: LogMetricsDto): Promise<void> {
    try {
      await this.usageRepo.insert({
        route: metrics.route,
        method: metrics.method as any,
        userId: metrics.userId,
        durationMs: metrics.durationMs,
        statusCode: metrics.statusCode,
        userAgent: metrics.userAgent,
        ipAddress: metrics.ipAddress,
      });
    } catch (error) {
      this.logger.error('Failed to log API usage', error);
    }
  }

  async getSummary(hoursBack: number = 24): Promise<ApiUsageSummary> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const logs = await this.usageRepo.find({
      where: {
        createdAt: MoreThanOrEqual(since),
      },
    });

    // Calculate request by route/method
    const routeMap = new Map<
      string,
      { count: number; totalDuration: number }
    >();

    logs.forEach((log) => {
      const key = `${log.route}|${log.method}`;
      const existing = routeMap.get(key) || {
        count: 0,
        totalDuration: 0,
      };
      existing.count++;
      existing.totalDuration += log.durationMs;
      routeMap.set(key, existing);
    });

    // Calculate request by status code
    const statusMap = new Map<number, number>();
    logs.forEach((log) => {
      statusMap.set(log.statusCode, (statusMap.get(log.statusCode) ?? 0) + 1);
    });

    // Calculate top users
    const userMap = new Map<string, number>();
    logs.forEach((log) => {
      if (log.userId) {
        userMap.set(log.userId, (userMap.get(log.userId) ?? 0) + 1);
      }
    });

    const topUsers = Array.from(userMap.entries())
      .map(([userId, requestCount]) => ({ userId, requestCount }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 10);

    const totalDuration = logs.reduce((sum, log) => sum + log.durationMs, 0);
    const averageResponseTime =
      logs.length > 0 ? totalDuration / logs.length : 0;

    return {
      totalRequests: logs.length,
      averageResponseTime,
      requestsByRoute: Array.from(routeMap.entries()).map(([key, value]) => {
        const [route, method] = key.split('|');
        return {
          route,
          method,
          count: value.count,
          avgDuration: Math.round(value.totalDuration / value.count),
        };
      }),
      requestsByStatusCode: Array.from(statusMap.entries()).map(
        ([statusCode, count]) => ({
          statusCode,
          count,
        }),
      ),
      topUsers,
    };
  }

  async getRawLogs(options: {
    limit?: number;
    offset?: number;
    route?: string;
    method?: string;
    statusCode?: number;
    hoursBack?: number;
  }) {
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;
    const hoursBack = options.hoursBack ?? 24;
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const queryBuilder = this.usageRepo
      .createQueryBuilder('log')
      .where('log.createdAt >= :since', { since });

    if (options.route) {
      queryBuilder.andWhere('log.route = :route', { route: options.route });
    }
    if (options.method) {
      queryBuilder.andWhere('log.method = :method', { method: options.method });
    }
    if (options.statusCode) {
      queryBuilder.andWhere('log.statusCode = :statusCode', {
        statusCode: options.statusCode,
      });
    }

    const [items, total] = await queryBuilder
      .orderBy('log.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async cleanupOldLogs(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    const result = await this.usageRepo.delete({
      createdAt: LessThan(cutoffDate),
    });

    this.logger.log(
      `Cleaned up ${result.affected} API usage logs older than ${retentionDays} days`,
    );

    return result.affected ?? 0;
  }
}
