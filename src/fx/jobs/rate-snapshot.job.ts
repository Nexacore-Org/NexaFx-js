import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { RateSnapshot } from '../entities/rate-snapshot.entity';

@Injectable()
export class RateSnapshotJob {
  constructor(private readonly dataSource: DataSource) {}

  private async fetchRates(): Promise<Record<string, number>> {
    // replace with provider
    return {
      'USD/NGN': 1500,
      'EUR/NGN': 1650,
    };
  }

  @Cron('0 * * * *') // every hour
  async handleSnapshot() {
    const rates = await this.fetchRates();
    const repo = this.dataSource.getRepository(RateSnapshot);

    const now = new Date();
    const hourBucket = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
    );

    for (const [pair, rate] of Object.entries(rates)) {
      await repo
        .createQueryBuilder()
        .insert()
        .into(RateSnapshot)
        .values({
          currencyPair: pair,
          open: rate,
          high: rate,
          low: rate,
          close: rate,
          snapshotAt: hourBucket,
          granularity: '1h',
        })
        .orUpdate(
          ['open', 'high', 'low', 'close'],
          ['currencyPair', 'snapshotAt', 'granularity'],
        )
        .execute();
    }
  }
}
