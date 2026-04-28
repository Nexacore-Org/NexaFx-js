import { Injectable, Logger } from '@nestjs/common';

export interface TransactionEvent {
  transactionId: string;
  userId: string;
  amount: number;
  currency: string;
  fromAddress: string;
  toAddress: string;
  country: string;
  continent: string;
  deviceId: string;
  createdAt: Date;
}

export interface AnomalyResult {
  flagged: boolean;
  rules: string[];
  riskScoreIncrease: number;
}

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  evaluate(tx: TransactionEvent, recentTxns: TransactionEvent[]): AnomalyResult {
    const rules: string[] = [];
    let riskScore = 0;

    if (this.detectGeographicVelocity(tx, recentTxns)) {
      rules.push('GEO_VELOCITY');
      riskScore += 30;
    }

    if (this.detectDeviceAnomaly(tx, recentTxns)) {
      rules.push('DEVICE_ANOMALY');
      riskScore += 15;
    }

    if (this.detectCircularTransfer(tx, recentTxns)) {
      rules.push('CIRCULAR_TRANSFER');
      riskScore += 40;
    }

    if (rules.length > 0) {
      this.logger.warn(
        `Anomaly detected for user ${tx.userId}: ${rules.join(', ')} (+${riskScore})`,
      );
    }

    return { flagged: rules.length > 0, rules, riskScoreIncrease: riskScore };
  }

  private detectGeographicVelocity(
    tx: TransactionEvent,
    recent: TransactionEvent[],
  ): boolean {
    const twoHoursAgo = new Date(tx.createdAt.getTime() - 2 * 60 * 60 * 1000);
    const conflicting = recent.find(
      (r) =>
        r.userId === tx.userId &&
        r.createdAt >= twoHoursAgo &&
        r.continent !== tx.continent,
    );
    return !!conflicting;
  }

  private detectDeviceAnomaly(
    tx: TransactionEvent,
    recent: TransactionEvent[],
  ): boolean {
    const priorDeviceUse = recent.some(
      (r) => r.userId === tx.userId && r.deviceId === tx.deviceId,
    );
    return !priorDeviceUse;
  }

  private detectCircularTransfer(
    tx: TransactionEvent,
    recent: TransactionEvent[],
  ): boolean {
    const thirtyMinAgo = new Date(tx.createdAt.getTime() - 30 * 60 * 1000);
    const window = recent.filter((r) => r.createdAt >= thirtyMinAgo);

    for (const hop1 of window) {
      if (hop1.fromAddress !== tx.toAddress) continue;
      for (const hop2 of window) {
        if (hop2.fromAddress === hop1.toAddress && hop2.toAddress === tx.fromAddress) {
          return true;
        }
      }
    }
    return false;
  }
}
