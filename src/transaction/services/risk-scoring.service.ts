import { Injectable } from '@nestjs/common';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { Transaction } from '../entities/transaction.entity';

@Injectable()
export class RiskScoringService {
  constructor(private anomalyService: AnomalyDetectionService) {}

  async evaluateTransactionRisk(tx: Transaction, lastTx?: Transaction) {
    let riskIncrement = 0;
    const rulesTriggered: string[] = [];

    // 1. Geographic Velocity Check
    if (lastTx && tx.metadata?.lat && lastTx.metadata?.lat) {
      const distance = this.anomalyService.calculateDistance(
        tx.metadata.lat, tx.metadata.lon,
        lastTx.metadata.lat, lastTx.metadata.lon
      );
      
      const timeDiffHours = (tx.createdAt.getTime() - lastTx.createdAt.getTime()) / (1000 * 60 * 60);
      
      // Continent hopping logic (rough distance threshold ~5000km)
      if (distance > 5000 && timeDiffHours < 2) {
        riskIncrement += 30;
        rulesTriggered.push('GEO_IMPOSSIBILITY');
      }
    }

    // 2. Device Anomaly
    if (tx.metadata?.isNewDevice) {
      riskIncrement += 15;
      rulesTriggered.push('NEW_DEVICE_ANOMALY');
    }

    // 3. Circular Transfer Check
    const isCircular = await this.anomalyService.detectCircularTransfer(tx.senderAddress);
    if (isCircular) {
      riskIncrement += 50; // High risk for wash trading/circularity
      rulesTriggered.push('CIRCULAR_TRANSFER');
    }

    return { riskIncrement, rulesTriggered };
  }
}