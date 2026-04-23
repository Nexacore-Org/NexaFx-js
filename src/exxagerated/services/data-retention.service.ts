import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, LessThan } from 'typeorm';

@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);
  private entityThresholds: Record<string, number> = {
    transactions: 12, // Default to 12 months for archival
  };

  constructor(private dataSource: DataSource) {}

  setRetentionPolicy(entity: string, months: number) {
    this.entityThresholds[entity] = months;
    this.logger.log(`Retention policy updated for ${entity}: ${months} months`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDataArchival() {
    this.logger.log('Starting daily data archival cron job...');
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const thresholdMonths = this.entityThresholds['transactions'] || 12;
      const archiveDate = new Date();
      archiveDate.setMonth(archiveDate.getMonth() - thresholdMonths);

      // Select transactions older than the threshold
      const oldTransactions = await queryRunner.manager.find('transactions', {
        where: { createdAt: LessThan(archiveDate) }
      });

      if (oldTransactions.length > 0) {
         await queryRunner.startTransaction();
         
         // Move to archive table
         await queryRunner.manager.insert('transaction_archives', oldTransactions);
         
         // Delete from main operational table
         const ids = oldTransactions.map(t => t.id);
         await queryRunner.manager.delete('transactions', ids);
         
         await queryRunner.commitTransaction();
         this.logger.log(`Archived ${oldTransactions.length} transactions.`);
      }
    } catch (error) {
      if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
      }
      this.logger.error('Failed to archive data', error.stack);
    } finally {
      await queryRunner.release();
    }
  }
}