import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { RiskSnapshot } from '../entities/risk-snapshot.entity';
import { RiskState } from '../entities/risk-state.entity';

@Injectable()
export class RiskAnalyticsService {
  constructor(
    @InjectRepository(RiskSnapshot)
    private readonly snapshotRepo: Repository<RiskSnapshot>,
    @InjectRepository(RiskState)
    private readonly stateRepo: Repository<RiskState>,
  ) {}

  async getPortfolioDashboard(userId: string) {
    // Get latest state
    const state = await this.stateRepo.findOne({ where: { userId } });
    // Get 30-day trend
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const trend = await this.snapshotRepo.find({
      where: { userId, timestamp: MoreThanOrEqual(since) },
      order: { timestamp: 'ASC' },
    });
    return { state, trend };
  }

  async getVaRTrend(userId: string) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return this.snapshotRepo.find({
      where: { userId, timestamp: MoreThanOrEqual(since) },
      order: { timestamp: 'ASC' },
      select: ['timestamp', 'var', 'riskScore'],
    });
  }

  async getTopRiskUsers(limit = 10) {
    // Get latest snapshot for each user, order by riskScore desc
    return this.snapshotRepo.query(`
      SELECT DISTINCT ON ("userId") *
      FROM risk_snapshots
      ORDER BY "userId", "timestamp" DESC
      LIMIT $1
    `, [limit]);
  }
}
