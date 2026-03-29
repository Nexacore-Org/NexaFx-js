import { Cron, CronExpression } from "@nestjs/schedule";
import { Injectable } from "@nestjs/common";
import { SystemMetricsService } from "../services/system-metrics.service";
import { NotificationsGateway } from "../../../web-sockets/notifications.gateway";

@Injectable()
export class MetricsAlertJob {
  constructor(
    private readonly metrics: SystemMetricsService,
    private readonly gateway: NotificationsGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkThresholds() {
    const data = await this.metrics.collectMetrics();

    if (data.redis.latency > 200 || data.apiStats.errorRate > 0.05) {
      this.gateway.emitDashboardAlert({
        type: "metrics.alert",
        message: "System metrics threshold exceeded",
        data,
      });
    }
  }
}
