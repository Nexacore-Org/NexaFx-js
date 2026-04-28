import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RateSnapshot } from '../entities/rate-snapshot.entity';

@Controller('fx')
export class FxController {
  constructor(private readonly dataSource: DataSource) {}

  // CURRENT RATES
  @Get('rates')
  async getCurrentRates() {
    const repo = this.dataSource.getRepository(RateSnapshot);

    const rows = await repo.query(`
      SELECT DISTINCT ON (currency_pair)
        currency_pair,
        close as bid,
        close * 1.01 as ask,
        (close * 1.01 - close) as spread,
        snapshot_at
      FROM rate_snapshots
      WHERE granularity = '1h'
      ORDER BY currency_pair, snapshot_at DESC
    `);

    return rows;
  }

  // ✅ HISTORY API
  @Get('rates/:pair/history')
  async getHistory(
    @Param('pair') pair: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('granularity') granularity: '1h' | '1d' = '1h',
    @Query('cursor') cursor?: string,
  ) {
    const repo = this.dataSource.getRepository(RateSnapshot);

    if (granularity === '1h') {
      return repo.query(
        `
        SELECT *
        FROM rate_snapshots
        WHERE currency_pair = $1
          AND snapshot_at BETWEEN $2 AND $3
        ORDER BY snapshot_at ASC
        LIMIT 100
        `,
        [pair, from, to],
      );
    }

    // DB-level OHLC aggregation
    return repo.query(
      `
      SELECT
        currency_pair,
        DATE(snapshot_at) as day,
        FIRST_VALUE(open) OVER w as open,
        MAX(high) as high,
        MIN(low) as low,
        LAST_VALUE(close) OVER w as close
      FROM rate_snapshots
      WHERE currency_pair = $1
        AND snapshot_at BETWEEN $2 AND $3
      WINDOW w AS (
        PARTITION BY DATE(snapshot_at)
        ORDER BY snapshot_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
      )
      GROUP BY currency_pair, DATE(snapshot_at)
      ORDER BY day ASC
      `,
      [pair, from, to],
    );
  }
}
