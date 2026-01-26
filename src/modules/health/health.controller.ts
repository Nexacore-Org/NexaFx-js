import { Controller, Get, Query } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './indicators/database.indicator';

interface StatusResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: {
      status: 'up' | 'down';
      responseTime?: number;
    };
  };
  details?: Record<string, unknown>;
}

@Controller('status')
export class HealthController {
  private readonly startTime: number;

  constructor(
    private readonly health: HealthCheckService,
    private readonly databaseIndicator: DatabaseHealthIndicator,
  ) {
    this.startTime = Date.now();
  }

  @Get()
  @HealthCheck()
  async getStatus(
    @Query('verbose') verbose?: string,
  ): Promise<StatusResponse> {
    const isVerbose = verbose === 'true' || verbose === '1';

    let healthResult: HealthCheckResult;
    try {
      healthResult = await this.health.check([
        () => this.databaseIndicator.isHealthy('database'),
      ]);
    } catch (error) {
      healthResult = (error as { response?: HealthCheckResult }).response || {
        status: 'error',
        info: {},
        error: { database: { status: 'down' } },
        details: { database: { status: 'down' } },
      };
    }

    const dbStatus = healthResult.details?.database || healthResult.error?.database;
    const isDbUp = dbStatus?.status === 'up';

    const response: StatusResponse = {
      status: this.determineOverallStatus(healthResult),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.0.1',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: {
        database: {
          status: isDbUp ? 'up' : 'down',
          responseTime: dbStatus?.responseTime,
        },
      },
    };

    if (isVerbose) {
      response.details = await this.getVerboseDetails();
    }

    return response;
  }

  private determineOverallStatus(
    result: HealthCheckResult,
  ): 'healthy' | 'unhealthy' | 'degraded' {
    if (result.status === 'ok') {
      return 'healthy';
    }

    const hasError = result.error && Object.keys(result.error).length > 0;
    const hasInfo = result.info && Object.keys(result.info).length > 0;

    if (hasError && hasInfo) {
      return 'degraded';
    }

    return 'unhealthy';
  }

  private async getVerboseDetails(): Promise<Record<string, unknown>> {
    const dbDetails = await this.databaseIndicator.getDetails();

    return {
      database: dbDetails,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memoryUsage: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          unit: 'MB',
        },
        cpuUsage: process.cpuUsage(),
      },
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
