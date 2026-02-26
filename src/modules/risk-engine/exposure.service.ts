// src/modules/risk/exposure.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class ExposureService {
  private netExposure = new Map<string, number>(); // Asset -> Net Quantity
  private readonly RISK_THRESHOLD = 500000; // $500k alert limit

  async updateExposure(asset: string, amount: number, isBuy: boolean) {
    const current = this.netExposure.get(asset) || 0;
    const update = isBuy ? current + amount : current - amount;
    this.netExposure.set(asset, update);

    if (Math.abs(update) > this.RISK_THRESHOLD) {
      this.triggerRiskAlert(asset, update);
    }
  }

  private triggerRiskAlert(asset: string, exposure: number) {
    console.warn(`[RISK ALERT]: High exposure detected for ${asset}: ${exposure}`);
    // Connects to Incident Module (#237) from Batch 1
  }

  async getAdminSnapshot() {
    return Object.fromEntries(this.netExposure);
  }
}