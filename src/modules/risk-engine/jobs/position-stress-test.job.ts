import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RiskManagerService } from '../services/risk-manager.service';
import { DataSource } from 'typeorm';

@Injectable()
export class PositionStressTestJob {
  private readonly logger = new Logger(PositionStressTestJob.name);

  constructor(
    private riskService: RiskManagerService,
    private dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyStressTests() {
    this.logger.log('Starting hourly position stress tests...');
    
    // Get all users with at least one open position
    const activeUsers = await this.dataSource.query(
      `SELECT DISTINCT "userId" FROM positions WHERE status = 'OPEN'`
    );

    for (const { userId } of activeUsers) {
      try {
        const utilization = await this.riskService.calculateMarginUtilization(userId);
        // Stress Scenario: Simulate 15% market volatility
        const stressedUtilization = utilization * 1.15; 
        
        await this.riskService.evaluateRiskLevel(userId, stressedUtilization);
      } catch (err) {
        this.logger.error(`Stress test failed for user ${userId}`, err.stack);
      }
    }
  }
}