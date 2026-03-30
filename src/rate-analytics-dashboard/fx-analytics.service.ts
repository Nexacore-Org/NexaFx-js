import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { RateSnapshot } from '../entities/rate-snapshot.entity';
import {
  ProviderHealthMetric,
  CircuitBreakerState,
  ProviderStatus,
} from '../entities/provider-health-metric.entity';
import {
  LiveRateDto,
  OhlcHistoryResponseDto,
  OhlcGranularity,
  HistoryQueryDto,
  ProviderHealthDto,
  OhlcBarDto,
} from '../dto/fx-analytics.dto';

/**
 * Minimal interface that FxAggregatorService must satisfy.
 * Inject the real FxAggregatorService; this typing avoids a hard circular dep.
 */
export interface FxRateResult {
  pair: string;
  bid: number;
  ask: number;
  providers: Array<{
    name: string;
    bid: number;
    ask: number;
    confidence: number;           // 0–1
    circuitBreakerState: string;  // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    latencyMs?: number;
  }>;
  timestamp: Date;
}

export const FX_AGGREGATOR_SERVICE = 'FX_AGGREGATOR_SERVICE';

@Injectable()
export class FxAnalyticsService {
  private readonly logger = new Logger(FxAnalyticsService.name);

  /** Max days of history we serve (90-day cap per issue). */
  private readonly MAX_HISTORY_DAYS = 90;

  /** EMA smoothing factor for latency updates (0.1 = slow decay). */
  private readonly LATENCY_EMA_ALPHA = 0.1;

  /** Error-rate threshold above which a provider is flagged DEGRADED. */
  private readonly DEGRADED_ERROR_RATE_THRESHOLD = 0.20;

  constructor(
    @InjectRepository(RateSnapshot)
    private readonly snapshotRepo: Repository<RateSnapshot>,

    @InjectRepository(ProviderHealthMetric)
    private readonly healthRepo: Repository<ProviderHealthMetric>,
  ) {}

  // ── Live rates ─────────────────────────────────────────────────────────────

  /**
   * Returns the latest live rates from the aggregator for every known pair,
   * enriched with bid/ask/spread and per-provider confidence.
   *
   * Callers inject FxAggregatorService themselves and pass the results in,
   * keeping this service agnostic of the aggregator's internals.
   */
  buildLiveRates(aggregatedRates: FxRateResult[]): LiveRateDto[] {
    return aggregatedRates.map((r) => {
      const mid = (r.bid + r.ask) / 2;
      const spread = r.ask - r.bid;
      const spreadPct = mid > 0 ? spread / mid : 0;

      return {
        pair: r.pair,
        bid: +r.bid.toFixed(8),
        ask: +r.ask.toFixed(8),
        mid: +mid.toFixed(8),
        spread: +spread.toFixed(8),
        spreadPct: +spreadPct.toFixed(6),
        providers: r.providers.map((p) => ({
          provider: p.name,
          confidence: p.confidence,
          circuitBreakerState: p.circuitBreakerState,
        })),
        timestamp: r.timestamp.toISOString(),
      };
    });
  }

  // ── OHLC history ───────────────────────────────────────────────────────────

  async getOhlcHistory(
    pair: string,
    query: HistoryQueryDto,
  ): Promise<OhlcHistoryResponseDto> {
    const { granularity = OhlcGranularity.ONE_HOUR, limit = 50, offset = 0 } = query;

    // 90-day hard cap on how far back we query
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.MAX_HISTORY_DAYS);

    // Fetch raw hourly snapshots within range
    const rawSnapshots = await this.snapshotRepo.find({
      where: {
        pair: pair.toUpperCase(),
        bucketHour: MoreThanOrEqual(cutoff),
      },
      order: { bucketHour: 'ASC' },
    });

    if (rawSnapshots.length === 0) {
      const norm = pair.toUpperCase();
      // Verify the pair exists at all
      const anyRow = await this.snapshotRepo.findOne({ where: { pair: norm } });
      if (!anyRow) {
        throw new NotFoundException(`No history found for pair "${norm}"`);
      }
    }

    // Aggregate hourly buckets into the requested granularity
    const bars = this.aggregateToBars(rawSnapshots, granularity);

    // Apply pagination
    const total = bars.length;
    const paged = bars.slice(offset, offset + limit);

    return {
      pair: pair.toUpperCase(),
      granularity,
      total,
      limit,
      offset,
      bars: paged,
    };
  }

  /**
   * Rolls up hourly RateSnapshot rows into OHLC bars at the requested
   * granularity.  All timestamps are UTC bucket-starts.
   */
  private aggregateToBars(
    snapshots: RateSnapshot[],
    granularity: OhlcGranularity,
  ): OhlcBarDto[] {
    if (snapshots.length === 0) return [];

    const getBucketKey = (d: Date): string => {
      const t = new Date(d);
      if (granularity === OhlcGranularity.ONE_HOUR) {
        t.setUTCMinutes(0, 0, 0);
        return t.toISOString();
      }
      if (granularity === OhlcGranularity.ONE_DAY) {
        t.setUTCHours(0, 0, 0, 0);
        return t.toISOString();
      }
      // ONE_WEEK: Monday of the ISO week
      const day = t.getUTCDay(); // 0=Sun
      const daysToMon = day === 0 ? -6 : 1 - day;
      t.setUTCDate(t.getUTCDate() + daysToMon);
      t.setUTCHours(0, 0, 0, 0);
      return t.toISOString();
    };

    // Group snapshots by bucket key
    const buckets = new Map<string, RateSnapshot[]>();
    for (const snap of snapshots) {
      const key = getBucketKey(snap.bucketHour);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(snap);
    }

    // Build OHLC bar per bucket (sorted chronologically)
    return [...buckets.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([time, rows]) => {
        const closes = rows.map((r) => Number(r.close));
        const opens = rows.map((r) => Number(r.open));
        const highs = rows.map((r) => Number(r.high));
        const lows = rows.map((r) => Number(r.low));
        const bids = rows.map((r) => Number(r.bid));
        const asks = rows.map((r) => Number(r.ask));

        const totalSamples = rows.reduce((s, r) => s + r.sampleCount, 0);
        const weightedConf = rows.reduce(
          (s, r) => s + Number(r.confidenceScore) * r.sampleCount,
          0,
        );
        const avgConf = totalSamples > 0 ? weightedConf / totalSamples : 0;
        const avgBid = bids.reduce((a, b) => a + b, 0) / bids.length;
        const avgAsk = asks.reduce((a, b) => a + b, 0) / asks.length;
        const avgSpread = avgAsk - avgBid;
        const avgMid = (avgBid + avgAsk) / 2;

        return {
          time,
          open: +opens[0].toFixed(8),
          high: +Math.max(...highs).toFixed(8),
          low: +Math.min(...lows).toFixed(8),
          close: +closes[closes.length - 1].toFixed(8),
          bid: +avgBid.toFixed(8),
          ask: +avgAsk.toFixed(8),
          spread: +avgSpread.toFixed(8),
          spreadPct: avgMid > 0 ? +(avgSpread / avgMid).toFixed(6) : 0,
          sampleCount: totalSamples,
          confidenceScore: +avgConf.toFixed(4),
        };
      });
  }

  // ── Provider health ────────────────────────────────────────────────────────

  async getProviderHealth(): Promise<ProviderHealthDto[]> {
    const metrics = await this.healthRepo.find({
      order: { providerName: 'ASC' },
    });

    return metrics.map((m) => this.toProviderHealthDto(m));
  }

  /**
   * Called by the rate-snapshot job after every aggregator poll so that
   * metrics stay fresh without extra health-check calls.
   */
  async upsertProviderMetrics(
    providers: Array<{
      name: string;
      success: boolean;
      latencyMs: number;
      circuitBreakerState: string;
      confidence: number;
    }>,
  ): Promise<void> {
    for (const p of providers) {
      let metric = await this.healthRepo.findOne({
        where: { providerName: p.name },
      });

      if (!metric) {
        metric = this.healthRepo.create({
          providerName: p.name,
          requestCount1h: 0,
          errorCount1h: 0,
          totalRequests: 0,
          totalErrors: 0,
          avgLatencyMs: p.latencyMs,
          circuitBreakerState: CircuitBreakerState.CLOSED,
          lastTrippedAt: null,
          lastSuccessAt: null,
        });
      }

      const wasHealthy =
        metric.circuitBreakerState === CircuitBreakerState.CLOSED;
      const cbState = p.circuitBreakerState as CircuitBreakerState;

      // EMA latency update
      metric.avgLatencyMs =
        this.LATENCY_EMA_ALPHA * p.latencyMs +
        (1 - this.LATENCY_EMA_ALPHA) * Number(metric.avgLatencyMs);

      metric.requestCount1h += 1;
      metric.totalRequests = BigInt(metric.totalRequests as unknown as number) + 1n as unknown as number;

      if (!p.success) {
        metric.errorCount1h += 1;
        metric.totalErrors = BigInt(metric.totalErrors as unknown as number) + 1n as unknown as number;
      } else {
        metric.lastSuccessAt = new Date();
      }

      // Detect circuit breaker trip
      if (cbState === CircuitBreakerState.OPEN && wasHealthy) {
        metric.lastTrippedAt = new Date();
        this.logger.warn(`[ProviderHealth] ${p.name} circuit OPEN — tripped at ${metric.lastTrippedAt.toISOString()}`);
      }

      metric.circuitBreakerState = cbState;

      await this.healthRepo.save(metric);
    }
  }

  /**
   * Resets the rolling 1-hour counters. Called by the hourly cron after the
   * DEGRADED check so the window shifts correctly.
   */
  async resetHourlyCounters(): Promise<void> {
    await this.healthRepo
      .createQueryBuilder()
      .update(ProviderHealthMetric)
      .set({ requestCount1h: 0, errorCount1h: 0 })
      .execute();
  }

  // ── Snapshot persistence ───────────────────────────────────────────────────

  /**
   * Upserts a single hourly bucket row for the given pair.
   * If a row for (pair, bucketHour) already exists, the OHLC values are
   * updated: open is preserved, high/low/close are refreshed, and
   * aggregated confidence/sample stats are updated.
   */
  async upsertHourlySnapshot(rate: FxRateResult): Promise<void> {
    const bucketHour = this.truncateToHour(rate.timestamp);
    const pair = rate.pair.toUpperCase();

    const bid = rate.bid;
    const ask = rate.ask;
    const mid = (bid + ask) / 2;
    const spread = ask - bid;
    const spreadPct = mid > 0 ? spread / mid : 0;

    const avgConfidence =
      rate.providers.length > 0
        ? rate.providers.reduce((s, p) => s + p.confidence, 0) /
          rate.providers.length
        : 0;

    const existing = await this.snapshotRepo.findOne({
      where: { pair, bucketHour },
    });

    if (existing) {
      // Update within the same hour window
      existing.high = Math.max(Number(existing.high), mid);
      existing.low = Math.min(Number(existing.low), mid);
      existing.close = mid;
      existing.bid = bid;
      existing.ask = ask;
      existing.spread = spread;
      existing.spreadPct = spreadPct;
      existing.sampleCount += 1;
      // Incremental average of confidence
      existing.confidenceScore =
        (Number(existing.confidenceScore) * (existing.sampleCount - 1) +
          avgConfidence) /
        existing.sampleCount;

      await this.snapshotRepo.save(existing);
    } else {
      const snap = this.snapshotRepo.create({
        pair,
        bucketHour,
        open: mid,
        high: mid,
        low: mid,
        close: mid,
        bid,
        ask,
        spread,
        spreadPct,
        sampleCount: 1,
        confidenceScore: avgConfidence,
      });
      await this.snapshotRepo.save(snap);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private truncateToHour(d: Date): Date {
    const t = new Date(d);
    t.setUTCMinutes(0, 0, 0);
    return t;
  }

  private toProviderHealthDto(m: ProviderHealthMetric): ProviderHealthDto {
    const errorRate1h =
      m.requestCount1h > 0 ? m.errorCount1h / m.requestCount1h : 0;

    const uptimePct =
      Number(m.totalRequests) > 0
        ? ((Number(m.totalRequests) - Number(m.totalErrors)) /
            Number(m.totalRequests)) *
          100
        : 100;

    let status: ProviderStatus;
    if (m.circuitBreakerState === CircuitBreakerState.OPEN) {
      status = ProviderStatus.DOWN;
    } else if (errorRate1h > this.DEGRADED_ERROR_RATE_THRESHOLD) {
      status = ProviderStatus.DEGRADED;
    } else {
      status = ProviderStatus.HEALTHY;
    }

    return {
      provider: m.providerName,
      status,
      uptimePct: +uptimePct.toFixed(2),
      avgLatencyMs: +Number(m.avgLatencyMs).toFixed(2),
      errorRate1h: +errorRate1h.toFixed(4),
      requestCount1h: m.requestCount1h,
      errorCount1h: m.errorCount1h,
      circuitBreakerState: m.circuitBreakerState,
      lastTrippedAt: m.lastTrippedAt ? m.lastTrippedAt.toISOString() : null,
      lastSuccessAt: m.lastSuccessAt ? m.lastSuccessAt.toISOString() : null,
    };
  }
}
