import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionRiskScoreEntity } from '../entities/transaction-risk-score.entity';
import {
  RiskCheckContext,
  RiskCheckResult,
  RiskLevel,
} from '../interfaces/risk-check.interface';
import { VelocityCheck } from './risk-checks/velocity.check';
import { VolumeSpikeCheck } from './risk-checks/volume-spike.check';
import { NewDeviceCheck } from './risk-checks/new-device.check';
import { OverrideRiskScoreDto } from '../dto/override-risk-score.dto';

const FLAG_THRESHOLD = 60;

@Injectable()
export class TransactionRiskScoringService {
  private readonly logger = new Logger(TransactionRiskScoringService.name);

  constructor(
    @InjectRepository(TransactionRiskScoreEntity)
    private readonly riskRepo: Repository<TransactionRiskScoreEntity>,
    private readonly velocityCheck: VelocityCheck,
    private readonly volumeSpikeCheck: VolumeSpikeCheck,
    private readonly newDeviceCheck: NewDeviceCheck,
  ) {}

  async score(context: RiskCheckContext): Promise<TransactionRiskScoreEntity> {
    const checks: RiskCheckResult[] = await Promise.all([
      this.velocityCheck.run(context),
      this.volumeSpikeCheck.run(context),
      this.newDeviceCheck.run(context),
    ]);

    const triggeredChecks = checks.filter((c) => c.triggered);
    const totalScore = triggeredChecks.reduce((sum, c) => sum + c.score, 0);
    const level = this.resolveLevel(totalScore);
    const flagged = totalScore >= FLAG_THRESHOLD;

    if (flagged) {
      this.logger.warn(
        `High-risk transaction detected: txId=${context.transactionId}, userId=${context.userId}, score=${totalScore}, level=${level}`,
      );
    }

    const entity = this.riskRepo.create({
      transactionId: context.transactionId,
      userId: context.userId,
      score: totalScore,
      level,
      flagged,
      triggeredChecks: triggeredChecks.map((c) => ({
        checkName: c.checkName,
        score: c.score,
        reason: c.reason,
      })),
    });

    return this.riskRepo.save(entity);
  }

  async getByTransactionId(
    transactionId: string,
  ): Promise<TransactionRiskScoreEntity | null> {
    return this.riskRepo.findOne({ where: { transactionId } });
  }

  async getFlaggedTransactions(
    page = 1,
    limit = 20,
  ): Promise<{ data: TransactionRiskScoreEntity[]; total: number }> {
    const [data, total] = await this.riskRepo.findAndCount({
      where: { flagged: true, overridden: false },
      order: { score: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total };
  }

  async adminOverride(
    transactionId: string,
    dto: OverrideRiskScoreDto,
    adminId: string,
  ): Promise<TransactionRiskScoreEntity> {
    const existing = await this.riskRepo.findOne({ where: { transactionId } });
    if (!existing) {
      throw new NotFoundException(
        `No risk score found for transaction ${transactionId}`,
      );
    }

    existing.overridden = true;
    existing.overriddenBy = adminId;
    existing.overrideReason = dto.reason;
    existing.overrideLevel = dto.overrideLevel ?? existing.level;
    existing.flagged = dto.clearFlag ?? false;
    existing.overriddenAt = new Date();

    const saved = await this.riskRepo.save(existing);

    this.logger.log(
      `Admin ${adminId} overrode risk score for transaction ${transactionId}: ${dto.reason}`,
    );

    return saved;
  }

  async getRiskSummary(): Promise<Record<string, number>> {
    const result = await this.riskRepo
      .createQueryBuilder('r')
      .select('r.level', 'level')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.level')
      .getRawMany();

    return result.reduce(
      (acc, row) => ({ ...acc, [row.level]: parseInt(row.count, 10) }),
      {},
    );
  }

  private resolveLevel(score: number): RiskLevel {
    if (score >= 80) return RiskLevel.CRITICAL;
    if (score >= 60) return RiskLevel.HIGH;
    if (score >= 30) return RiskLevel.MEDIUM;
    return RiskLevel.LOW;
  }
}
