import { Cron, CronExpression } from "@nestjs/schedule";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { SystemMetricsService } from "../services/system-metrics.service";
import { NotificationsGateway } from "../../../web-sockets/notifications.gateway";

@Injectable()
export class MetricsAlertJob {
  private readonly logger = new Logger(MetricsAlertJob.name);

  constructor(
    private readonly metrics: SystemMetricsService,
    @Optional() private readonly gateway: NotificationsGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkThresholds() {
    try {
      const data = await this.metrics.collectMetrics();

      const redisLatencyExceeded = data.redis?.latency != null && data.redis.latency > 200;
      const errorRateExceeded = data.apiStats?.errorRate > 0.05;

      if ((redisLatencyExceeded || errorRateExceeded) && this.gateway) {
        this.gateway.emitDashboardAlert?.({
          type: "metrics.alert",
          message: "System metrics threshold exceeded",
          data,
        });
      }
    } catch (e) {
      this.logger.warn(`Metrics collection failed: ${e.message}`);
    }
  }
}
