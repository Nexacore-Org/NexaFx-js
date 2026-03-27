import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

@Injectable()
export class FeatureAggregationJob {
  private readonly logger = new Logger(FeatureAggregationJob.name);

  constructor(private dataSource: DataSource) {}

  @Cron(CronExpression.EVERY_HOUR)
  async aggregateFeatures() {
    this.logger.log('Starting hourly feature aggregation...');
    
    // Aggregating 24h/7d/30d volumes per user for the risk engine
    const query = `
      INSERT INTO user_risk_aggregates (user_id, window, total_volume, tx_count, updated_at)
      SELECT 
        "userId", 
        '24h', 
        SUM(amount), 
        COUNT(id), 
        NOW()
      FROM transactions
      WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
      GROUP BY "userId"
      ON CONFLICT (user_id, window) DO UPDATE SET
        total_volume = EXCLUDED.total_volume,
        tx_count = EXCLUDED.tx_count,
        updated_at = EXCLUDED.updated_at;
    `;

    await this.dataSource.query(query);
    this.logger.log('Feature aggregation complete.');
  }
}