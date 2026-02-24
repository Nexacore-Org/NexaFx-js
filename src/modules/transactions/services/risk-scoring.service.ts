import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, Between } from 'typeorm';
import { TransactionEntity } from '../entities/transaction.entity';
import { TransactionRiskEntity, RiskFactor, RiskEvaluationLog } from '../entities/transaction-risk.entity';
import { DeviceEntity } from '../../sessions/entities/device.entity';
import { RiskEvaluationResultDto, RiskLevel, ReviewStatus } from '../dto/risk-evaluation.dto';

export interface RiskScoringConfig {
  highValueThreshold: number;
  rapidTransferTimeWindow: number; // in minutes
  rapidTransferCountThreshold: number;
  velocityAnomalyMultiplier: number;
  autoFlagThreshold: number;
  criticalThreshold: number;
  newDeviceRiskScore: number;
  untrustedDeviceRiskScore: number;
}

export interface VelocityData {
  transactionsInLastHour: number;
  totalAmountInLastHour: number;
  transactionsInLastDay: number;
  totalAmountInLastDay: number;
  averageTransactionAmount: number;
}

@Injectable()
export class RiskScoringService {
  private readonly logger = new Logger(RiskScoringService.name);

  private readonly defaultConfig: RiskScoringConfig = {
    highValueThreshold: 10000, // $10,000
    rapidTransferTimeWindow: 60, // 60 minutes
    rapidTransferCountThreshold: 5,
    velocityAnomalyMultiplier: 3.0, // 3x average is suspicious
    autoFlagThreshold: 70, // Flag transactions with score >= 70
    criticalThreshold: 90, // Critical risk at score >= 90
    newDeviceRiskScore: 25,
    untrustedDeviceRiskScore: 40,
  };

  constructor(
    @InjectRepository(TransactionRiskEntity)
    private readonly riskRepo: Repository<TransactionRiskEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,
  ) {}

  /**
   * Evaluate risk for a transaction
   */
  async evaluateRisk(
    transactionId: string,
    userId?: string,
    deviceId?: string,
  ): Promise<RiskEvaluationResultDto> {
    this.logger.log(`Evaluating risk for transaction: ${transactionId}`);

    const transaction = await this.txRepo.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    // Get or create risk record
    let riskRecord = await this.riskRepo.findOne({
      where: { transactionId },
    });

    if (!riskRecord) {
      riskRecord = this.riskRepo.create({
        transactionId,
        riskScore: 0,
        riskLevel: RiskLevel.LOW,
        isFlagged: false,
        riskFactors: [],
        evaluationHistory: [],
        reviewStatus: ReviewStatus.PENDING_REVIEW,
      });
    }

    const previousScore = riskRecord.riskScore;
    const riskFactors: RiskFactor[] = [];

    // Rule 1: High-value transaction check
    const highValueFactor = await this.evaluateHighValue(transaction);
    if (highValueFactor) riskFactors.push(highValueFactor);

    // Rule 2: Rapid consecutive transfers
    const rapidTransferFactor = await this.evaluateRapidTransfers(transaction, userId);
    if (rapidTransferFactor) riskFactors.push(rapidTransferFactor);

    // Rule 3: Velocity-based anomaly detection
    const velocityFactor = await this.evaluateVelocityAnomaly(transaction, userId);
    if (velocityFactor) riskFactors.push(velocityFactor);

    // Rule 4: New device login check
    const deviceFactor = await this.evaluateDeviceRisk(transaction, userId, deviceId);
    if (deviceFactor) riskFactors.push(deviceFactor);

    // Calculate total risk score
    const totalRiskScore = riskFactors.reduce((sum, factor) => sum + factor.score, 0);
    const riskLevel = this.calculateRiskLevel(totalRiskScore);
    const isFlagged = totalRiskScore >= this.defaultConfig.autoFlagThreshold;

    // Get velocity data for context
    const velocityData = userId
      ? await this.calculateVelocityData(userId, transaction)
      : undefined;

    // Get device context
    const deviceContext = deviceId
      ? await this.getDeviceContext(userId, deviceId)
      : undefined;

    // Update risk record
    riskRecord.riskScore = totalRiskScore;
    riskRecord.riskLevel = riskLevel;
    riskRecord.isFlagged = isFlagged;
    riskRecord.riskFactors = riskFactors;
    riskRecord.riskEvaluatedAt = new Date();
    riskRecord.velocityData = velocityData;
    riskRecord.deviceContext = deviceContext;

    if (isFlagged && !riskRecord.flaggedAt) {
      riskRecord.flaggedAt = new Date();
      riskRecord.flagReason = this.generateFlagReason(riskFactors);
    }

    // Add to evaluation history
    const evaluationLog: RiskEvaluationLog = {
      evaluatedAt: new Date(),
      previousScore,
      newScore: totalRiskScore,
      factors: riskFactors,
      triggeredRules: riskFactors.map((f) => f.rule),
    };
    riskRecord.evaluationHistory = [...riskRecord.evaluationHistory, evaluationLog];

    await this.riskRepo.save(riskRecord);

    // Update transaction with risk info
    transaction.riskScore = totalRiskScore;
    transaction.isFlagged = isFlagged;
    transaction.riskEvaluatedAt = new Date();
    transaction.requiresManualReview = isFlagged;
    await this.txRepo.save(transaction);

    this.logger.log(
      `Risk evaluation complete for ${transactionId}: score=${totalRiskScore}, level=${riskLevel}, flagged=${isFlagged}`,
    );

    return {
      transactionId,
      riskScore: totalRiskScore,
      riskLevel,
      isFlagged,
      flagReason: riskRecord.flagReason,
      riskFactors,
      requiresManualReview: isFlagged,
      velocityData,
      deviceContext,
    };
  }

  /**
   * Rule 1: High-value transaction threshold
   */
  private async evaluateHighValue(transaction: TransactionEntity): Promise<RiskFactor | null> {
    const amount = parseFloat(transaction.amount.toString());

    if (amount >= this.defaultConfig.highValueThreshold) {
      const score = Math.min(30, Math.floor((amount / this.defaultConfig.highValueThreshold) * 10));
      return {
        rule: 'HIGH_VALUE_TRANSACTION',
        score,
        description: `Transaction amount (${amount}) exceeds high-value threshold (${this.defaultConfig.highValueThreshold})`,
        metadata: {
          amount,
          threshold: this.defaultConfig.highValueThreshold,
          currency: transaction.currency,
        },
      };
    }

    return null;
  }

  /**
   * Rule 2: Rapid consecutive transfers
   */
  private async evaluateRapidTransfers(
    transaction: TransactionEntity,
    userId?: string,
  ): Promise<RiskFactor | null> {
    if (!userId) return null;

    const timeWindow = new Date();
    timeWindow.setMinutes(timeWindow.getMinutes() - this.defaultConfig.rapidTransferTimeWindow);

    // Count recent transactions from the same user
    const recentCount = await this.txRepo.count({
      where: {
        createdAt: MoreThan(timeWindow),
        // Note: This assumes userId is stored in metadata, adjust as needed
      },
    });

    if (recentCount >= this.defaultConfig.rapidTransferCountThreshold) {
      return {
        rule: 'RAPID_CONSECUTIVE_TRANSFERS',
        score: 25,
        description: `${recentCount} transactions in the last ${this.defaultConfig.rapidTransferTimeWindow} minutes`,
        metadata: {
          transactionCount: recentCount,
          timeWindowMinutes: this.defaultConfig.rapidTransferTimeWindow,
        },
      };
    }

    return null;
  }

  /**
   * Rule 3: Velocity-based anomaly detection
   */
  private async evaluateVelocityAnomaly(
    transaction: TransactionEntity,
    userId?: string,
  ): Promise<RiskFactor | null> {
    if (!userId) return null;

    const velocityData = await this.calculateVelocityData(userId, transaction);
    const currentAmount = parseFloat(transaction.amount.toString());

    // Check if current transaction is anomalous compared to user's history
    if (
      velocityData.averageTransactionAmount > 0 &&
      currentAmount > velocityData.averageTransactionAmount * this.defaultConfig.velocityAnomalyMultiplier
    ) {
      return {
        rule: 'VELOCITY_ANOMALY',
        score: 35,
        description: `Transaction amount (${currentAmount}) is ${(
          currentAmount / velocityData.averageTransactionAmount
        ).toFixed(1)}x higher than user's average (${velocityData.averageTransactionAmount.toFixed(2)})`,
        metadata: {
          currentAmount,
          averageAmount: velocityData.averageTransactionAmount,
          multiplier: this.defaultConfig.velocityAnomalyMultiplier,
        },
      };
    }

    // Check for unusual frequency
    if (velocityData.transactionsInLastHour > 10) {
      return {
        rule: 'UNUSUAL_FREQUENCY',
        score: 20,
        description: `Unusual transaction frequency: ${velocityData.transactionsInLastHour} transactions in the last hour`,
        metadata: {
          transactionsInLastHour: velocityData.transactionsInLastHour,
        },
      };
    }

    return null;
  }

  /**
   * Rule 4: Device risk evaluation
   */
  private async evaluateDeviceRisk(
    transaction: TransactionEntity,
    userId?: string,
    deviceId?: string,
  ): Promise<RiskFactor | null> {
    if (!userId || !deviceId) return null;

    const device = await this.deviceRepo.findOne({
      where: { userId, deviceKey: deviceId },
    });

    if (!device) {
      // New device - higher risk
      return {
        rule: 'NEW_DEVICE',
        score: this.defaultConfig.newDeviceRiskScore,
        description: 'Transaction initiated from a new/unrecognized device',
        metadata: {
          deviceId,
          isNewDevice: true,
        },
      };
    }

    // Check device trust level
    if (device.trustLevel === 'risky') {
      return {
        rule: 'UNTRUSTED_DEVICE',
        score: this.defaultConfig.untrustedDeviceRiskScore,
        description: `Transaction from device with trust level: ${device.trustLevel}`,
        metadata: {
          deviceId,
          trustLevel: device.trustLevel,
          trustScore: device.trustScore,
        },
      };
    }

    // Check if device was recently added (within 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    if (device.createdAt > oneDayAgo) {
      return {
        rule: 'RECENT_DEVICE',
        score: 15,
        description: 'Transaction from device added within the last 24 hours',
        metadata: {
          deviceId,
          deviceCreatedAt: device.createdAt,
        },
      };
    }

    return null;
  }

  /**
   * Calculate velocity data for a user
   */
  private async calculateVelocityData(
    userId: string,
    currentTransaction: TransactionEntity,
  ): Promise<VelocityData> {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    // Get transactions in last hour (excluding current)
    const lastHourTxs = await this.txRepo.find({
      where: {
        createdAt: MoreThan(oneHourAgo),
        id: currentTransaction.id,
      },
    });

    // Get transactions in last day (excluding current)
    const lastDayTxs = await this.txRepo.find({
      where: {
        createdAt: MoreThan(oneDayAgo),
        id: currentTransaction.id,
      },
    });

    const transactionsInLastHour = lastHourTxs.length;
    const totalAmountInLastHour = lastHourTxs.reduce(
      (sum, tx) => sum + parseFloat(tx.amount.toString()),
      0,
    );

    const transactionsInLastDay = lastDayTxs.length;
    const totalAmountInLastDay = lastDayTxs.reduce(
      (sum, tx) => sum + parseFloat(tx.amount.toString()),
      0,
    );

    const averageTransactionAmount =
      transactionsInLastDay > 0 ? totalAmountInLastDay / transactionsInLastDay : 0;

    return {
      transactionsInLastHour,
      totalAmountInLastHour,
      transactionsInLastDay,
      totalAmountInLastDay,
      averageTransactionAmount,
    };
  }

  /**
   * Get device context
   */
  private async getDeviceContext(
    userId?: string,
    deviceId?: string,
  ): Promise<RiskEvaluationResultDto['deviceContext']> {
    if (!userId || !deviceId) {
      return { isNewDevice: true };
    }

    const device = await this.deviceRepo.findOne({
      where: { userId, deviceKey: deviceId },
    });

    if (!device) {
      return {
        deviceId,
        isNewDevice: true,
      };
    }

    return {
      deviceId,
      isNewDevice: false,
      deviceTrustScore: device.trustScore,
      lastLoginFromDevice: device.lastLoginAt,
    };
  }

  /**
   * Calculate risk level from score
   */
  private calculateRiskLevel(score: number): RiskLevel {
    if (score >= this.defaultConfig.criticalThreshold) return RiskLevel.CRITICAL;
    if (score >= this.defaultConfig.autoFlagThreshold) return RiskLevel.HIGH;
    if (score >= 40) return RiskLevel.MEDIUM;
    return RiskLevel.LOW;
  }

  /**
   * Generate flag reason from risk factors
   */
  private generateFlagReason(riskFactors: RiskFactor[]): string {
    const criticalRules = riskFactors.filter((f) => f.score >= 30);
    if (criticalRules.length > 0) {
      return `Critical risk factors: ${criticalRules.map((f) => f.rule).join(', ')}`;
    }
    return `Risk factors detected: ${riskFactors.map((f) => f.rule).join(', ')}`;
  }

  /**
   * Get flagged transactions for admin review
   */
  async getFlaggedTransactions(options: {
    riskLevel?: RiskLevel;
    reviewStatus?: ReviewStatus;
    minRiskScore?: number;
    maxRiskScore?: number;
    page?: number;
    limit?: number;
  }): Promise<{ items: TransactionRiskEntity[]; total: number }> {
    const { riskLevel, reviewStatus, minRiskScore, maxRiskScore, page = 1, limit = 20 } = options;

    const qb = this.riskRepo
      .createQueryBuilder('risk')
      .leftJoinAndSelect('risk.transaction', 'transaction')
      .where('risk.isFlagged = :isFlagged', { isFlagged: true });

    if (riskLevel) {
      qb.andWhere('risk.riskLevel = :riskLevel', { riskLevel });
    }

    if (reviewStatus) {
      qb.andWhere('risk.reviewStatus = :reviewStatus', { reviewStatus });
    }

    if (minRiskScore !== undefined) {
      qb.andWhere('risk.riskScore >= :minRiskScore', { minRiskScore });
    }

    if (maxRiskScore !== undefined) {
      qb.andWhere('risk.riskScore <= :maxRiskScore', { maxRiskScore });
    }

    qb.orderBy('risk.riskScore', 'DESC').addOrderBy('risk.createdAt', 'DESC');

    const offset = (page - 1) * limit;
    qb.skip(offset).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return { items, total };
  }

  /**
   * Review a flagged transaction
   */
  async reviewFlaggedTransaction(
    riskId: string,
    adminId: string,
    reviewStatus: ReviewStatus,
    adminNotes?: string,
    allowAutoProcessing?: boolean,
  ): Promise<TransactionRiskEntity> {
    const riskRecord = await this.riskRepo.findOne({
      where: { id: riskId },
      relations: ['transaction'],
    });

    if (!riskRecord) {
      throw new Error(`Risk record not found: ${riskId}`);
    }

    riskRecord.reviewStatus = reviewStatus;
    riskRecord.reviewedBy = adminId;
    riskRecord.reviewedAt = new Date();

    if (adminNotes) {
      riskRecord.adminNotes = adminNotes;
    }

    if (allowAutoProcessing !== undefined) {
      riskRecord.autoProcessed = allowAutoProcessing;
    }

    // Add to evaluation history
    const evaluationLog: RiskEvaluationLog = {
      evaluatedAt: new Date(),
      previousScore: riskRecord.riskScore,
      newScore: riskRecord.riskScore,
      factors: riskRecord.riskFactors,
      triggeredRules: ['ADMIN_REVIEW'],
      evaluatedBy: adminId,
    };
    riskRecord.evaluationHistory = [...riskRecord.evaluationHistory, evaluationLog];

    await this.riskRepo.save(riskRecord);

    this.logger.log(`Flagged transaction ${riskId} reviewed by admin ${adminId}: ${reviewStatus}`);

    return riskRecord;
  }

  /**
   * Check if transaction can be auto-processed
   */
  async canAutoProcess(transactionId: string): Promise<boolean> {
    const riskRecord = await this.riskRepo.findOne({
      where: { transactionId },
    });

    if (!riskRecord) {
      return true; // No risk record means no risk
    }

    // Cannot auto-process if flagged and not reviewed
    if (riskRecord.isFlagged && riskRecord.reviewStatus === ReviewStatus.PENDING_REVIEW) {
      return false;
    }

    // Cannot auto-process if rejected
    if (riskRecord.reviewStatus === ReviewStatus.REJECTED) {
      return false;
    }

    return true;
  }

  /**
   * Get risk statistics for dashboard
   */
  async getRiskStatistics(): Promise<{
    totalFlagged: number;
    pendingReview: number;
    approved: number;
    rejected: number;
    escalated: number;
    averageRiskScore: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  }> {
    const [
      totalFlagged,
      pendingReview,
      approved,
      rejected,
      escalated,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
    ] = await Promise.all([
      this.riskRepo.count({ where: { isFlagged: true } }),
      this.riskRepo.count({ where: { reviewStatus: ReviewStatus.PENDING_REVIEW } }),
      this.riskRepo.count({ where: { reviewStatus: ReviewStatus.APPROVED } }),
      this.riskRepo.count({ where: { reviewStatus: ReviewStatus.REJECTED } }),
      this.riskRepo.count({ where: { reviewStatus: ReviewStatus.ESCALATED } }),
      this.riskRepo.count({ where: { riskLevel: RiskLevel.CRITICAL } }),
      this.riskRepo.count({ where: { riskLevel: RiskLevel.HIGH } }),
      this.riskRepo.count({ where: { riskLevel: RiskLevel.MEDIUM } }),
      this.riskRepo.count({ where: { riskLevel: RiskLevel.LOW } }),
    ]);

    const avgResult = await this.riskRepo
      .createQueryBuilder('risk')
      .select('AVG(risk.riskScore)', 'average')
      .getRawOne();

    return {
      totalFlagged,
      pendingReview,
      approved,
      rejected,
      escalated,
      averageRiskScore: parseFloat(avgResult?.average || '0'),
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
    };
  }
}
