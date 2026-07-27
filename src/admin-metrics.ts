import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminMetricsService {
  getSystemMetrics() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date(),
      activeConnections: 0,
      requestsPerMinute: 0
    };
  }

  getLiveMetrics() {
    return {
      ...this.getSystemMetrics(),
      cpuUsage: process.cpuUsage()
    };
  }
}
