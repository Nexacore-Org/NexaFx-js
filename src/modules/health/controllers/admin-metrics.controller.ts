import { Controller, Get, UseGuards } from "@nestjs/common";
import { SystemMetricsService } from "../services/system-metrics.service";
import { AdminGuard } from "../../auth/guards/admin.guard";

@Controller("admin/metrics")
@UseGuards(AdminGuard)
export class AdminMetricsController {
  constructor(private readonly metrics: SystemMetricsService) {}

  @Get()
  async getMetrics() {
    // Respond quickly using cached values
    return this.metrics.getCachedMetrics();
  }
}
