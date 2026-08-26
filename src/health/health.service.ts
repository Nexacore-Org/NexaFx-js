import { Injectable, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { DataSource } from 'typeorm';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class HealthService {
  constructor(
    private readonly http: HttpService,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  async check(): Promise<Record<string, string>> {
    const stellarUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org';
    let stellarStatus = 'connected';
    try {
      await firstValueFrom(this.http.get(stellarUrl));
    } catch {
      stellarStatus = 'disconnected';
    }

    let dbStatus = 'connected';
    if (this.dataSource) {
      try {
        await this.dataSource.query('SELECT 1');
      } catch {
        dbStatus = 'disconnected';
      }
    }

    const isHealthy = stellarStatus === 'connected' && dbStatus === 'connected';
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      stellar: stellarStatus,
      database: dbStatus,
    };
  }
}
