import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not } from 'typeorm';
import {
  Dispute,
  DisputeState,
  DisputeOutcome,
} from '../entities/dispute.entity';
import { Transaction } from '../entities/transaction.entity';
import { User } from '../entities/user.entity';
import { disputeConfig } from '../config/dispute.config';

export enum FraudFactorType {
  DUPLICATE = 'DUPLICATE',
  TIMING = 'TIMING',
  AMOUNT = 'AMOUNT',
  USER_HISTORY = 'USER_HISTORY',
  TRANSACTION_PATTERN = 'TRANSACTION_PATTERN',
}

// EPSILON for floating-point comparison tolerance
const EPSILON = 0.01; // 1 cent tolerance

export interface FraudFactor {
  type: FraudFactorType;
  description: string;
  score: number;
}

export interface FraudAnalysisResult {
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  factors: FraudFactor[];
  recommendations: string[];
}

@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name);
  constructor(
    @InjectRepository(Dispute)
    private disputeRepository: Repository<Dispute>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Analyzes a dispute for fraud indicators and returns a risk assessment.
   *
   * @param dispute - The dispute to analyze. Must include the transaction relation
   *                 if dispute.amountNaira is not available (use TypeORM relations:
   *                 { relations: ['transaction'] })
   * @returns Promise<FraudAnalysisResult> - The fraud analysis result with score and factors
   * @throws Error if neither dispute.amountNaira nor dispute.transaction.amountNaira is available
   */
  async analyzeDispute(dispute: Dispute): Promise<FraudAnalysisResult> {
    const factors: FraudFactor[] = [];
    let score = 0;

    // Check user dispute history
    const userDisputeHistory = await this.analyzeUserDisputeHistory(
      dispute.userId,
    );
    if (userDisputeHistory.isSuspicious) {
      score += userDisputeHistory.score;
      factors.push(...userDisputeHistory.factors);
    }

    // Check transaction patterns
    const transactionAnalysis = await this.analyzeTransactionPatterns(
      dispute.transactionId,
    );
    if (transactionAnalysis.isSuspicious) {
      score += transactionAnalysis.score;
      factors.push(...transactionAnalysis.factors);
    }

    // Check amount patterns
    // Guard: Ensure transaction relation is loaded before accessing transaction.amountNaira
    const amountNaira =
      dispute.amountNaira ||
      (dispute.transaction ? dispute.transaction.amountNaira : null);

    if (amountNaira === null || amountNaira === undefined) {
      throw new Error(
        `Cannot analyze dispute amount: dispute.amountNaira is null and transaction relation is ${dispute.transaction ? 'loaded but has no amountNaira' : 'not loaded'}. ` +
          'Ensure the Dispute entity includes the transaction relation when calling analyzeDispute().',
      );
    }

    const amountAnalysis = this.analyzeAmount(amountNaira);
    if (amountAnalysis.isSuspicious) {
      score += amountAnalysis.score;
      factors.push(...amountAnalysis.factors);
    }

    // Check timing patterns
    const timingAnalysis = this.analyzeTiming(dispute);
    if (timingAnalysis.isSuspicious) {
      score += timingAnalysis.score;
      factors.push(...timingAnalysis.factors);
    }

    // Check for duplicate disputes
    const duplicateAnalysis = await this.checkForDuplicates(dispute);
    if (duplicateAnalysis.isSuspicious) {
      score += duplicateAnalysis.score;
      factors.push(...duplicateAnalysis.factors);
    }

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high';
    if (score >= disputeConfig.fraud.scoring.highRiskThreshold) {
      riskLevel = 'high';
    } else if (score >= disputeConfig.fraud.scoring.mediumRiskThreshold) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(riskLevel, factors);

    return {
      score: Math.min(score, 100), // Cap at 100
      riskLevel,
      factors,
      recommendations,
    };
  }

  private async analyzeUserDisputeHistory(userId: string): Promise<{
    isSuspicious: boolean;
    score: number;
    factors: FraudFactor[];
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const recentDisputes = await this.disputeRepository.count({
      where: {
        userId,
        createdAt: Between(thirtyDaysAgo, new Date()),
      },
    });

    const totalDisputes = await this.disputeRepository.count({
      where: { userId },
    });

    const factors: FraudFactor[] = [];
    let score = 0;

    if (recentDisputes > disputeConfig.fraud.rules.maxDisputesPerUser) {
      score += 30;
      factors.push({
        type: FraudFactorType.USER_HISTORY,
        description: `User has ${recentDisputes} disputes in the last 30 days`,
        score: 30,
      });
    }

    if (totalDisputes > 10) {
      score += 20;
      factors.push({
        type: FraudFactorType.USER_HISTORY,
        description: `User has ${totalDisputes} total disputes`,
        score: 20,
      });
    }

    // Check for patterns in dispute outcomes
    const resolvedDisputes = await this.disputeRepository.find({
      where: { userId, state: DisputeState.RESOLVED },
      take: 10,
    });

    const userFavorCount = resolvedDisputes.filter(
      (d) => d.outcome === DisputeOutcome.USER_FAVOR,
    ).length;
    const totalResolved = resolvedDisputes.length;

    if (totalResolved > 0 && userFavorCount / totalResolved > 0.8) {
      score += 25;
      factors.push({
        type: FraudFactorType.USER_HISTORY,
        description: `User has won ${userFavorCount}/${totalResolved} disputes (${Math.round((userFavorCount / totalResolved) * 100)}%)`,
        score: 25,
      });
    }

    return {
      isSuspicious: score > 0,
      score,
      factors,
    };
  }

  private async analyzeTransactionPatterns(transactionId: string): Promise<{
    isSuspicious: boolean;
    score: number;
    factors: FraudFactor[];
  }> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      return { isSuspicious: false, score: 0, factors: [] };
    }

    const factors: FraudFactor[] = [];
    let score = 0;

    // Check for unusual transaction timing
    const transactionHour = new Date(transaction.createdAt).getHours();
    if (transactionHour < 6 || transactionHour > 22) {
      score += 15;
      factors.push({
        type: FraudFactorType.TRANSACTION_PATTERN,
        description: `Transaction occurred at unusual time (${transactionHour}:00)`,
        score: 15,
      });
    }

    // Check transaction amount patterns
    const amount = parseFloat(transaction.amountNaira);
    if (!isNaN(amount)) {
      const kobo = Math.round(amount * 100); // Convert to kobo (minor units)
      if (kobo % 100000 === 0 && kobo > 10000 * 100) {
        // 100000 kobo = 1000 Naira, 10000*100 kobo = 10000 Naira
        score += 10;
        factors.push({
          type: FraudFactorType.AMOUNT,
          description: 'Round number transaction amount',
          score: 10,
        });
      }
    }

    // Check for multiple transactions around the same time
    const timeWindow = 5 * 60 * 1000; // 5 minutes
    const similarTimeTransactions = await this.transactionRepository.count({
      where: {
        userId: transaction.userId,
        createdAt: Between(
          new Date(transaction.createdAt.getTime() - timeWindow),
          new Date(transaction.createdAt.getTime() + timeWindow),
        ),
      },
    });

    if (similarTimeTransactions > 3) {
      score += 20;
      factors.push({
        type: FraudFactorType.TRANSACTION_PATTERN,
        description: `${similarTimeTransactions} transactions within 5 minutes`,
        score: 20,
      });
    }

    return {
      isSuspicious: score > 0,
      score,
      factors,
    };
  }

  private analyzeAmount(amount: string): {
    isSuspicious: boolean;
    score: number;
    factors: FraudFactor[];
  } {
    const factors: FraudFactor[] = [];
    let score = 0;

    // Convert string amount to number for calculations
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) {
      score += 30;
      factors.push({
        type: FraudFactorType.AMOUNT,
        description: `Invalid amount format: ${amount}`,
        score: 30,
      });
      return { isSuspicious: true, score, factors };
    }

    // Check for suspicious amount thresholds
    const thresholds = disputeConfig.fraud.rules.suspiciousAmounts.thresholds;
    const matchingThreshold = thresholds.find(
      (t) => Math.abs(t - numericAmount) < EPSILON,
    );
    if (matchingThreshold !== undefined) {
      score += 15;
      factors.push({
        type: FraudFactorType.AMOUNT,
        description: `Amount matches suspicious threshold (₦${matchingThreshold.toLocaleString()})`,
        score: 15,
      });
    }

    // Check for very large amounts
    if (numericAmount > 500000) {
      score += 25;
      factors.push({
        type: FraudFactorType.AMOUNT,
        description: `Very large amount (₦${numericAmount.toLocaleString()})`,
        score: 25,
      });
    }

    // Check for very small amounts (potential testing)
    if (numericAmount < 100) {
      score += 10;
      factors.push({
        type: FraudFactorType.AMOUNT,
        description: `Very small amount (₦${numericAmount})`,
        score: 10,
      });
    }

    return {
      isSuspicious: score > 0,
      score,
      factors,
    };
  }

  private analyzeTiming(dispute: Dispute): {
    isSuspicious: boolean;
    score: number;
    factors: FraudFactor[];
  } {
    const factors: FraudFactor[] = [];
    let score = 0;

    // Check if transaction relation is loaded
    if (!dispute.transaction) {
      // Warn for observability when transaction relation is not loaded
      this.logger.warn(
        `Timing analysis skipped: missing loaded transaction relation for dispute ${dispute.id} (transactionId=${dispute.transactionId ?? 'unknown'}).`,
      );
      // If transaction relation is not loaded, skip timing analysis
      // This could indicate a data integrity issue or incomplete loading
      factors.push({
        type: FraudFactorType.TIMING,
        description: 'Transaction relation not loaded - cannot analyze timing',
        score: 0,
      });
      return {
        isSuspicious: false,
        score,
        factors,
      };
    }

    // Check dispute creation time relative to transaction
    const timeDifference =
      dispute.createdAt.getTime() - dispute.transaction.createdAt.getTime();
    const hoursDifference = timeDifference / (1000 * 60 * 60);

    // Very quick dispute (potential fraud)
    if (hoursDifference < 1) {
      score += 20;
      factors.push({
        type: FraudFactorType.TIMING,
        description: `Dispute created within 1 hour of transaction`,
        score: 20,
      });
    }

    // Very delayed dispute (potential forgotten transaction)
    if (hoursDifference > 72) {
      score += 10;
      factors.push({
        type: FraudFactorType.TIMING,
        description: `Dispute created ${Math.round(hoursDifference)} hours after transaction`,
        score: 10,
      });
    }

    // Check for weekend/holiday disputes
    const disputeDay = dispute.createdAt.getDay();
    if (disputeDay === 0 || disputeDay === 6) {
      score += 5;
      factors.push({
        type: FraudFactorType.TIMING,
        description: 'Dispute created on weekend',
        score: 5,
      });
    }

    return {
      isSuspicious: score > 0,
      score,
      factors,
    };
  }

  private async checkForDuplicates(dispute: Dispute): Promise<{
    isSuspicious: boolean;
    score: number;
    factors: FraudFactor[];
  }> {
    const factors: FraudFactor[] = [];
    let score = 0;

    // Check for similar disputes on the same transaction
    const existingDisputes = await this.disputeRepository.find({
      where: {
        transactionId: dispute.transactionId,
        ...(dispute.id && { id: Not(dispute.id) }),
      },
    });

    if (existingDisputes.length > 0) {
      score += 30;
      factors.push({
        type: FraudFactorType.DUPLICATE,
        description: `Duplicate dispute on same transaction`,
        score: 30,
      });
    }

    // Check for similar disputes by same user
    const userDisputes = await this.disputeRepository.find({
      where: {
        userId: dispute.userId,
        category: dispute.category,
        createdAt: Between(
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          new Date(),
        ),
      },
      take: 5,
    });

    if (userDisputes.length > 2) {
      score += 20;
      factors.push({
        type: FraudFactorType.DUPLICATE,
        description: `${userDisputes.length} similar disputes by same user in 7 days`,
        score: 20,
      });
    }

    return {
      isSuspicious: score > 0,
      score,
      factors,
    };
  }

  private generateRecommendations(
    riskLevel: string,
    factors: FraudFactor[],
  ): string[] {
    const recommendations: string[] = [];

    switch (riskLevel) {
      case 'high':
        recommendations.push('Escalate to fraud investigation team');
        recommendations.push('Require additional verification');
        recommendations.push('Consider temporary account restrictions');
        break;
      case 'medium':
        recommendations.push('Manual review required');
        recommendations.push('Request additional evidence');
        recommendations.push('Monitor user activity');
        break;
      case 'low':
        recommendations.push('Standard processing');
        recommendations.push('Monitor for patterns');
        break;
    }

    // Add specific recommendations based on factor types
    if (factors.some((f) => f.type === FraudFactorType.DUPLICATE)) {
      recommendations.push('Verify transaction uniqueness');
    }

    if (factors.some((f) => f.type === FraudFactorType.TIMING)) {
      recommendations.push('Verify transaction timing');
    }

    if (factors.some((f) => f.type === FraudFactorType.AMOUNT)) {
      recommendations.push('Verify transaction amount and purpose');
    }

    return recommendations;
  }

  async updateDisputeFraudScore(
    disputeId: string,
    analysis: FraudAnalysisResult,
  ): Promise<void> {
    await this.disputeRepository.update(disputeId, {
      fraudScore: analysis.score,
      isFraudulent: analysis.riskLevel === 'high',
    });
  }
}
