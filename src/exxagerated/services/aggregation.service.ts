import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataLineage } from '../entities/data-lineage.entity';
import { AnonymizationValidatorService } from './anonymization-validator.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);

  constructor(
    private validator: AnonymizationValidatorService,
    @InjectRepository(DataLineage)
    private lineageRepo: Repository<DataLineage>,
    private dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDailyVolumeAggregation() {
    const jobId = uuidv4();
    const period = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this.logger.log(`Starting Privacy-Safe Aggregation [Job: ${jobId}]...`);
    
    try {
      // 1. Fetch raw data
      const rawData = await this.dataSource.query(`SELECT * FROM transactions LIMIT 100`);
      
      // 2. PII Detection (FAIL FAST)
      const detectedPII = this.validator.detectPII(rawData);
      if (detectedPII.length > 0) {
        await this.logLineage({
          jobName: 'daily_volume',
          jobId,
          period,
          pii: detectedPII,
          applied: false,
          rowsProcessed: rawData.length,
          meta: { error: 'ABORTED_PII_DETECTED' }
        });
        throw new InternalServerErrorException(`Aggregation Aborted: PII detected in raw query results: ${detectedPII.join(', ')}`);
      }

      // 3. Threshold Validation
      this.validator.validateAggregationThreshold(rawData.length);

      // 4. Perform Anonymized Aggregation
      const result = await this.dataSource.query(`
        INSERT INTO analytics_metrics (metric_name, value, timestamp)
        SELECT 'total_volume', SUM(amount), NOW() FROM transactions
      `);

      // 5. Success Logging
      await this.logLineage({
        jobName: 'daily_volume',
        jobId,
        period,
        pii: [],
        applied: true,
        rowsProcessed: rawData.length,
        meta: { result }
      });
      return result;
    } catch (error) {
      this.logger.error(`Aggregation job failed: ${error.message}`);
      throw error;
    }
  }

  async getJobHistory(limit: number): Promise<DataLineage[]> {
    return this.lineageRepo.find({
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  private async logLineage(params: {
    jobName: string;
    jobId: string;
    period: string;
    pii: string[];
    applied: boolean;
    rowsProcessed: number;
    meta: any;
  }) {
    const log = this.lineageRepo.create({
      jobName: params.jobName,
      jobId: params.jobId,
      period: params.period,
      piiFieldsDetected: params.pii,
      anonymizationApplied: params.applied,
      rowsProcessed: params.rowsProcessed,
      metadata: params.meta,
    });
    return this.lineageRepo.save(log);
  }
}