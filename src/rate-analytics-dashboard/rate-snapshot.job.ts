import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { Logger, Inject, OnModuleInit } from '@nestjs/common';
import { FxAnalyticsService, FX_AGGREGATOR_SERVICE, FxRateResult } from './fx-analytics.service';

export const RATE_SNAPSHOT_QUEUE = 'rate-snapshot';
export const RATE_SNAPSHOT_JOB = 'persist-snapshot';
export const PROVIDER_HEALTH_RESET_JOB = 'reset-hourly-counters';

/**
 * Contract that FxAggregatorService must satisfy.
 */
export interface IFxAggregatorService {
  getAllPairRates(): Promise<FxRateResult[]>;
}

@Processor(RATE_SNAPSHOT_QUEUE)
export class RateSnapshotProcessor {
  private readonly logger = new Logger(RateSnapshotProcessor.name);

  constructor(
    private readonly analyticsService: FxAnalyticsService,
    @Inject(FX_AGGREGATOR_SERVICE)
    private readonly aggregator: IFxAggregatorService,
  ) {}

  @Process(RATE_SNAPSHOT_JOB)
  async handleSnapshotJob(job: Job): Promise<void> {
    this.logger.debug(`[${RATE_SNAPSHOT_JOB}] Running… (jobId=${job.id})`);

    let rates: FxRateResult[];
    try {
      rates = await this.aggregator.getAllPairRates();
    } catch (err) {
      this.logger.error('Failed to fetch rates from aggregator', err);
      throw err;
    }

    let persisted = 0;
    let failed = 0;

    for (const rate of rates) {
      try {
        await this.analyticsService.upsertHourlySnapshot(rate);

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

  @Process(PROVIDER_HEALTH_RESET_JOB)
  async handleHealthReset(job: Job): Promise<void> {
    this.logger.debug(`[${PROVIDER_HEALTH_RESET_JOB}] Resetting hourly counters (jobId=${job.id})`);
    await this.analyticsService.resetHourlyCounters();
    this.logger.log(`[${PROVIDER_HEALTH_RESET_JOB}] Hourly counters reset`);
  }
}

export class RateSnapshotScheduler implements OnModuleInit {
  private readonly logger = new Logger(RateSnapshotScheduler.name);

  constructor(
    @InjectQueue(RATE_SNAPSHOT_QUEUE)
    private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Remove repeatable jobs in Bull (v3/v4)
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.queue.removeRepeatableByKey(job.key);
      this.logger.debug(`Removed stale repeatable job: ${job.key}`);
    }

    await this.queue.add(
      RATE_SNAPSHOT_JOB,
      {},
      {
        repeat: { cron: '0 * * * *' }, // top of every hour
        jobId: `${RATE_SNAPSHOT_JOB}-repeatable`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 15000 },
        removeOnComplete: 48,
        removeOnFail: 24,
      },
    );

    await this.queue.add(
      PROVIDER_HEALTH_RESET_JOB,
      {},
      {
        repeat: { cron: '55 * * * *' }, // 55 min past
        jobId: `${PROVIDER_HEALTH_RESET_JOB}-repeatable`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    );

    this.logger.log('Rate snapshot & provider health reset jobs scheduled');
  }
}

