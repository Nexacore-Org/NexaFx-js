import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DataLineage } from './entities/data-lineage.entity';
import { AnonymizationValidatorService } from './services/anonymization-validator.service';

@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);

  constructor(
    private validator: AnonymizationValidatorService,
    @InjectRepository(DataLineage)
    private lineageRepo: Repository<DataLineage>,
    private dataSource: DataSource,
  ) {}

  async runDailyVolumeAggregation() {
    this.logger.log('Starting Privacy-Safe Aggregation...');
    
    // 1. Fetch raw data
    const rawData = await this.dataSource.query(`SELECT * FROM transactions LIMIT 100`);
    
    // 2. PII Detection (FAIL FAST)
    const detectedPII = this.validator.detectPII(rawData);
    if (detectedPII.length > 0) {
      await this.logLineage('daily_volume', detectedPII, false, { error: 'ABORTED_PII_DETECTED' });
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
    await this.logLineage('daily_volume', [], true, { recordCount: rawData.length });
    return result;
  }

  private async logLineage(jobName: string, pii: string[], applied: boolean, meta: any) {
    const log = this.lineageRepo.create({
      jobName,
      piiFieldsDetected: pii,
      anonymizationApplied: applied,
      metadata: meta,
    });
    return this.lineageRepo.save(log);
  }
}