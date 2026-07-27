import { Injectable } from '@nestjs/common';

@Injectable()
export class StellarNetworkMonitor {
  private networkStatus = 'healthy';
  
  async checkNetworkStatus(): Promise<string> {
    try {
      // Check Stellar network health
      const response = await fetch('https://horizon.stellar.org');
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
