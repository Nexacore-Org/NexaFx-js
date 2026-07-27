/** Periods a price chart can request. */
export type HistoryPeriod = '1h' | '24h' | '7d' | '30d';

/** A single recorded rate observation. */
export interface RatePoint {
  rate: number;
  recordedAt: Date;
}

/** Open/high/low/close summary for one time bucket. */
export interface OhlcCandle {
  bucket: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

const HOUR_MS = 3_600_000;

const PERIOD_HOURS: Record<HistoryPeriod, number> = {
  '1h': 1,
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};

/** Truncates a timestamp down to the top of its hour, so snapshots collapse per hour. */
export function truncateToHour(at: Date): Date {
  return new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS);
}

/** Drops points recorded before the trailing window implied by `period`. */
export function withinPeriod(
  points: RatePoint[],
  period: HistoryPeriod,
  now: Date = new Date(),
): RatePoint[] {
  const cutoff = now.getTime() - PERIOD_HOURS[period] * HOUR_MS;
  return points.filter((point) => point.recordedAt.getTime() >= cutoff);
}

/** Aggregates points into one OHLC candle per hour, ordered oldest to newest. */
export function toOhlc(points: RatePoint[]): OhlcCandle[] {
  const buckets = new Map<string, RatePoint[]>();
  for (const point of [...points].sort(
    (a, b) => +a.recordedAt - +b.recordedAt,
  )) {
    const key = truncateToHour(point.recordedAt).toISOString();
    buckets.set(key, [...(buckets.get(key) ?? []), point]);
  }
  return Array.from(buckets, ([bucket, group]) => {
    const rates = group.map((point) => point.rate);
    return {
      bucket,
      open: rates[0],
      high: Math.max(...rates),
      low: Math.min(...rates),
      close: rates[rates.length - 1],
    };
  }).sort((a, b) => a.bucket.localeCompare(b.bucket));
}
