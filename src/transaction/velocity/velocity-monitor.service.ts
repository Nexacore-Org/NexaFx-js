import { Injectable } from '@nestjs/common';

interface TransactionRecord {
  timestamp: number;
  amount: number;
}

@Injectable()
export class VelocityMonitorService {
  private transactionHistory = new Map<string, TransactionRecord[]>();

  recordTransaction(userId: string, amount: number): void {
    if (!this.transactionHistory.has(userId)) {
      this.transactionHistory.set(userId, []);
    }
    this.transactionHistory.get(userId)!.push({
      timestamp: Date.now(),
      amount,
    });
  }

  checkAnomalousPattern(userId: string, windowMs: number = 300000): boolean {
    const history = this.transactionHistory.get(userId) || [];
    const now = Date.now();
    const recentTxns = history.filter(t => now - t.timestamp < windowMs);
    return recentTxns.length > 20;
  }

  getTransactionCount(userId: string, windowMs: number = 300000): number {
    const history = this.transactionHistory.get(userId) || [];
    const now = Date.now();
    return history.filter(t => now - t.timestamp < windowMs).length;
  }
}
