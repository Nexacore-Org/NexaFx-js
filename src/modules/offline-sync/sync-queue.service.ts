// src/modules/offline-sync/sync-queue.service.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class SyncQueueService {
  private queue: any[] = [];

  async addToQueue(transaction: any) {
    this.queue.push({ ...transaction, status: 'PENDING_SYNC', attempts: 0 });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processQueue() {
    for (const tx of this.queue) {
      try {
        await this.providerService.send(tx);
        this.removeFromQueue(tx.id);
      } catch (e) {
        tx.attempts++;
        if (tx.attempts > 5) this.flagForManualReview(tx);
      }
    }
  }
}