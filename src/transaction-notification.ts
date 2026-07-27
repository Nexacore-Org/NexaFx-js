import { Injectable } from '@nestjs/common';

@Injectable()
export class TransactionNotificationService {
  private thresholds = {
    deposit: 1000,
    withdrawal: 1000,
    swap: 500
  };

  setThreshold(type: string, amount: number) {
    this.thresholds[type] = amount;
  }

  shouldNotify(type: string, amount: number): boolean {
    return amount >= (this.thresholds[type] || 0);
  }

  getThresholds() {
    return this.thresholds;
  }
}
