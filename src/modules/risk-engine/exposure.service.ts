// src/modules/risk/exposure.service.ts
import { Injectable } from '@nestjs/common';
import { AlertingService } from './services/alerting.service';

@Injectable()
export class ExposureService {
  private netExposure = new Map<string, number>(); // Asset -> Net Quantity
  private readonly RISK_THRESHOLD = 500000; // $500k alert limit

  constructor(private readonly alertingService: AlertingService) {}

  async updateExposure(asset: string, amount: number, isBuy: boolean) {
    const current = this.netExposure.get(asset) || 0;
    const update = isBuy ? current + amount : current - amount;
    this.netExposure.set(asset, update);

    if (Math.abs(update) > this.RISK_THRESHOLD) {
      await this.triggerRiskAlert(asset, update);
    }
  }

  private async triggerRiskAlert(asset: string, exposure: number) {
    await this.alertingService.sendRiskAlert({
      type: 'EXPOSURE',
      subjectId: asset,
      message: `High exposure detected for ${asset}: ${exposure}`,
      metadata: { exposure },
    });
  }

  async getAdminSnapshot() {
    return Object.fromEntries(this.netExposure);
  }
}
