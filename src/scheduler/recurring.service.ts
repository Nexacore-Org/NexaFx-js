// src/modules/scheduler/recurring.service.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class RecurringService {
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleRecurringPayments() {
    const dueTransactions = await this.findDueTransactions();

    for (const tx of dueTransactions) {
      try {
        await this.executeTransaction(tx);
        await this.updateNextExecutionDate(tx);
        // Notify user via NotificationModule from Batch 1
      } catch (error) {
        // Retry logic or notify admin via IncidentModule (#237)
      }
    }
  }

  private async executeTransaction(tx: any) {
    // Logic to move funds
    console.log(`Executing scheduled payment for user ${tx.userId}`);
  }
}