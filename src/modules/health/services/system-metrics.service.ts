import { Injectable } from "@nestjs/common";
import { QueueService } from "../../../queue/queue.service";
import { NotificationsGateway } from "../../../web-sockets/notifications.gateway";
import { DataSource } from "typeorm";
import Redis from "ioredis";

@Injectable()
export class SystemMetricsService {
  private cachedMetrics: any = null;

  constructor(
    private readonly queueService: QueueService,
    private readonly gateway: NotificationsGateway,
    private readonly dataSource: DataSource,
    private readonly redis: Redis,
  ) {}

  async collectMetrics(): Promise<any> {
    // Queue depths
    const queues = await this.queueService.getAllQueueDepths();

    // WebSocket connections
    const wsConnections = {
      total: this.gateway.getConnectedSocketCount(),
      perUser: Array.from(this.gateway["userSocketsMap"]).map(([userId, sockets]) => ({
        userId,
        sockets: sockets.size,
      })),
    };

    // DB pool stats
    const pool = (this.dataSource as any).driver?.pool;
    const dbStats = {
      active: pool?.activeCount ?? 0,
      idle: pool?.idleCount ?? 0,
      waiting: pool?.waitingCount ?? 0,
    };

    // Redis stats
    const start = Date.now();
    await this.redis.ping();
    const latency = Date.now() - start;
    const info = await this.redis.info("memory");
    const memoryUsage = info.match(/used_memory:(\d+)/)?.[1] ?? "0";

    // API usage stats (from middleware counters)
    const apiStats = {
      requestsLastHour: global["apiRequestsLastHour"] ?? 0,
      avgResponseTime: global["apiAvgResponseTime"] ?? 0,
      errorRate: global["apiErrorRate"] ?? 0,
    };

    this.cachedMetrics = {
      queues,
      wsConnections,
      dbStats,
      redis: { latency, memoryUsage },
      apiStats,
      timestamp: new Date().toISOString(),
    };

    return this.cachedMetrics;
  }

  getCachedMetrics() {
    return this.cachedMetrics;
  }
}
