// src/modules/routing/routing.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class RoutingService {
  private providers = [
    { name: 'Provider_A', latency: 150, cost: 0.05, reliability: 0.99 },
    { name: 'Provider_B', latency: 300, cost: 0.02, reliability: 0.95 },
  ];

  async selectBestProvider() {
    // Simple Score: (Reliability / Cost) - (Latency / 1000)
    return this.providers.sort((a, b) => {
      const scoreA = (a.reliability / a.cost) - (a.latency / 1000);
      const scoreB = (b.reliability / b.cost) - (b.latency / 1000);
      return scoreB - scoreA;
    })[0];
  }
}
