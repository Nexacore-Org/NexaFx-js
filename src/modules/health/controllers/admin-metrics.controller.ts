import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { SystemMetricsService } from "../services/system-metrics.service";
import { AdminGuard } from "../../auth/guards/admin.guard";

@ApiTags('Admin Metrics')
@ApiBearerAuth('access-token')
@Controller("admin/metrics")
@UseGuards(AdminGuard)
export class AdminMetricsController {
  constructor(private readonly metrics: SystemMetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Get system metrics dashboard (queue depths, WS connections, DB pool, Redis, API stats)' })
  @ApiResponse({ status: 200, description: 'System metrics snapshot' })
  async getMetrics() {
    // Return cached metrics (populated by MetricsAlertJob cron every minute)
    // On first request before cron fires, collect fresh metrics
    const cached = this.metrics.getCachedMetrics();
    if (cached) return cached;
    return this.metrics.collectMetrics();
  }
}
