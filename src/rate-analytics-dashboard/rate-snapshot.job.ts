import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger, Inject, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FxAnalyticsService, FX_AGGREGATOR_SERVICE, FxRateResult } from '../services/fx-analytics.service';

export const RATE_SNAPSHOT_QUEUE = 'rate-snapshot';
export const RATE_SNAPSHOT_JOB = 'persist-snapshot';
export const PROVIDER_HEALTH_RESET_JOB = 'reset-hourly-counters';

/**
 * Contract that FxAggregatorService must satisfy.
 * Adjust method names to match the actual implementation.
 */
export interface IFxAggregatorService {
  getAllPairRates(): Promise<FxRateResult[]>;
}

@Processor(RATE_SNAPSHOT_QUEUE)
export class RateSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(RateSnapshotProcessor.name);

  constructor(
    private readonly analyticsService: FxAnalyticsService,
    @Inject(FX_AGGREGATOR_SERVICE)
    private readonly aggregator: IFxAggregatorService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === RATE_SNAPSHOT_JOB) {
      await this.handleSnapshotJob(job);
      return;
    }
    if (job.name === PROVIDER_HEALTH_RESET_JOB) {
      await this.handleHealthReset();
      return;
    }
    this.logger.warn(`Unknown job name: ${job.name}`);
  }

  private async handleSnapshotJob(job: Job): Promise<void> {
    this.logger.debug(`[${RATE_SNAPSHOT_JOB}] Running… (jobId=${job.id})`);

    let rates: FxRateResult[];
    try {
      rates = await this.aggregator.getAllPairRates();
    } catch (err) {
      this.logger.error('Failed to fetch rates from aggregator', err);
      throw err; // BullMQ will retry per queue config
    }

    let persisted = 0;
    let failed = 0;

    for (const rate of rates) {
      try {
        await this.analyticsService.upsertHourlySnapshot(rate);

        // Update provider health from the same data — no extra HTTP calls
        const providerMeta = rate.providers.map((p) => ({
          name: p.name,
          success: p.circuitBreakerState !== 'OPEN',
          latencyMs: p.latencyMs ?? 0,
          circuitBreakerState: p.circuitBreakerState,
          confidence: p.confidence,
        }));
        await this.analyticsService.upsertProviderMetrics(providerMeta);

        persisted++;
      } catch (err) {
        failed++;
        this.logger.error(`Failed to persist snapshot for ${rate.pair}`, err);
      }
    }

    this.logger.log(
      `[${RATE_SNAPSHOT_JOB}] Done. persisted=${persisted}, failed=${failed}, total=${rates.length}`,
    );
  }

  private async handleHealthReset(): Promise<void> {
    this.logger.debug(`[${PROVIDER_HEALTH_RESET_JOB}] Resetting hourly counters`);
    await this.analyticsService.resetHourlyCounters();
    this.logger.log(`[${PROVIDER_HEALTH_RESET_JOB}] Hourly counters reset`);
  }
}

/**
 * Schedules the hourly snapshot + counter-reset jobs into the BullMQ queue.
 * Using BullMQ rather than @Cron directly so jobs are durable, deduplicated,
 * and retried on failure.
 */
export class RateSnapshotScheduler implements OnModuleInit {
  private readonly logger = new Logger(RateSnapshotScheduler.name);

  constructor(
    @InjectQueue(RATE_SNAPSHOT_QUEUE)
    private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Remove stale repeatable jobs so config changes take effect on restart
    const repeatables = await this.queue.getRepeatableJobs();
    for (const job of repeatables) {
      await this.queue.removeRepeatableByKey(job.key);
      this.logger.debug(`Removed stale repeatable job: ${job.key}`);
    }

    await this.queue.add(
      RATE_SNAPSHOT_JOB,
      {},
      {
        repeat: { pattern: '0 * * * *' }, // top of every hour
        jobId: `${RATE_SNAPSHOT_JOB}-repeatable`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 15_000 },
        removeOnComplete: { count: 48 },  // keep 48 hrs of completed records
        removeOnFail: { count: 24 },
      },
    );

    await this.queue.add(
      PROVIDER_HEALTH_RESET_JOB,
      {},
      {
        repeat: { pattern: '55 * * * *' }, // 55 min past — just before snapshot
        jobId: `${PROVIDER_HEALTH_RESET_JOB}-repeatable`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 5 },
      },
    );

    this.logger.log('Rate snapshot & provider health reset jobs scheduled');
  }
}
