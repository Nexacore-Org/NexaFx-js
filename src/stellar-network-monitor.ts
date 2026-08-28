import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StellarNetworkMonitor {
  private networkStatus = 'healthy';
  constructor(private readonly config: ConfigService) {}
  
  async checkNetworkStatus(): Promise<string> {
    try {
      const horizonUrl = this.config.get<string>('STELLAR_HORIZON_URL', 'https://horizon-testnet.stellar.org');
      const response = await fetch(horizonUrl);
      return response.ok ? 'healthy' : 'degraded';
    } catch (error) {
      return 'unavailable';
    }
  }

  async getNetworkStatus() {
    this.networkStatus = await this.checkNetworkStatus();
    return { status: this.networkStatus, timestamp: new Date() };
  }
}
