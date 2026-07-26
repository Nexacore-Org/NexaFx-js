import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class HealthService {
  constructor(private readonly http: HttpService) {}

  async check(): Promise<Record<string, string>> {
    const stellarUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org';
    try {
      await firstValueFrom(this.http.get(stellarUrl));
      return { status: 'healthy', stellar: 'connected' };
    } catch {
      return { status: 'unhealthy', stellar: 'disconnected' };
    }
  }
}
