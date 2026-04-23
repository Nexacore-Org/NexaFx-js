import { Injectable, Logger, Optional } from "@nestjs/common";
import { QueueService } from "../../../queue/queue.service";
import { NotificationsGateway } from "../../../web-sockets/notifications.gateway";
import { DataSource } from "typeorm";
import { RedisRateLimitService } from "../../rate-limit/services/redis-rate-limit.service";

@Injectable()
export class SystemMetricsService {
  private readonly logger = new Logger(SystemMetricsService.name);
  private cachedMetrics: any = null;

  constructor(
    @Optional() private readonly queueService: QueueService,
    @Optional() private readonly gateway: NotificationsGateway,
    private readonly dataSource: DataSource,
    @Optional() private readonly redisService: RedisRateLimitService,
  ) {}

  async collectMetrics(): Promise<any> {
    const [queues, wsConnections, dbStats, redisStats, apiStats] = await Promise.all([
      this.getQueueDepths(),
      this.getWsConnections(),
      this.getDbPoolStats(),
      this.getRedisStats(),
      this.getApiStats(),
    ]);

    this.cachedMetrics = {
      queues,
      wsConnections,
      dbStats,
      redis: redisStats,
      apiStats,
      timestamp: new Date().toISOString(),
    };

    return this.cachedMetrics;
  }

  getCachedMetrics() {
    return this.cachedMetrics;
  }

  private async getQueueDepths(): Promise<any> {
    if (!this.queueService) return {};
    try {
      return await this.queueService.getAllQueueDepths();
    } catch (e) {
      this.logger.warn(`Failed to get queue depths: ${e.message}`);
      return {};
    }
  }

  private getWsConnections(): any {
    if (!this.gateway) return { total: 0, perUser: [] };
    try {
      return {
        total: this.gateway.getConnectedSocketCount?.() ?? 0,
        perUser: [],
      };
    } catch {
      return { total: 0, perUser: [] };
    }
  }

  private getDbPoolStats(): any {
    try {
      const pool = (this.dataSource as any).driver?.pool;
      return {
        active: pool?.activeCount ?? 0,
        idle: pool?.idleCount ?? 0,
        waiting: pool?.waitingCount ?? 0,
      };
    } catch {
      return { active: 0, idle: 0, waiting: 0 };
    }
  }

  private async getRedisStats(): Promise<any> {
    if (!this.redisService?.isAvailable()) {
      return { latency: null, memoryUsage: null, available: false };
    }
    try {
      const client = (this.redisService as any).client;
      const start = Date.now();
      await client.ping();
      const latency = Date.now() - start;
      const info: string = await client.info('memory');
      const memoryUsage = info.match(/used_memory:(\d+)/)?.[1] ?? '0';
      return { latency, memoryUsage: parseInt(memoryUsage, 10), available: true };
    } catch (e) {
      return { latency: null, memoryUsage: null, available: false };
    }
  }

  private getApiStats(): any {
    return {
      requestsLastHour: (global as any)['apiRequestsLastHour'] ?? 0,
      avgResponseTime: (global as any)['apiAvgResponseTime'] ?? 0,
      errorRate: (global as any)['apiErrorRate'] ?? 0,
    };
  }
}
