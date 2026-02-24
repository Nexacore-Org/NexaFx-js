import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionRiskEntity, RiskEvaluationLog } from '../entities/transaction-risk.entity';

export interface RiskEvaluationEvent {
  transactionId: string;
  userId?: string;
  deviceId?: string;
  eventType: 'EVALUATION_STARTED' | 'EVALUATION_COMPLETED' | 'FLAGGED' | 'REVIEWED' | 'AUTO_BLOCKED';
  riskScore?: number;
  riskLevel?: string;
  factors?: Array<{
    rule: string;
    score: number;
    description: string;
  }>;
  metadata?: Record<string, any>;
  timestamp: Date;
}

@Injectable()
export class RiskEvaluationLoggerService {
  private readonly logger = new Logger(RiskEvaluationLoggerService.name);

  constructor(
    @InjectRepository(TransactionRiskEntity)
    private readonly riskRepo: Repository<TransactionRiskEntity>,
  ) {}

  /**
   * Log a risk evaluation event
   */
  async logEvent(event: RiskEvaluationEvent): Promise<void> {
    // Log to application logs
    const logMessage = this.formatLogMessage(event);

    switch (event.eventType) {
      case 'EVALUATION_STARTED':
        this.logger.log(logMessage);
        break;
      case 'EVALUATION_COMPLETED':
        this.logger.log(logMessage);
        break;
      case 'FLAGGED':
        this.logger.warn(logMessage);
        break;
      case 'AUTO_BLOCKED':
        this.logger.warn(logMessage);
        break;
      case 'REVIEWED':
        this.logger.log(logMessage);
        break;
      default:
        this.logger.log(logMessage);
    }

    // Store in evaluation history if risk record exists
    try {
      const riskRecord = await this.riskRepo.findOne({
        where: { transactionId: event.transactionId },
      });

      if (riskRecord && event.eventType === 'EVALUATION_COMPLETED') {
        const evaluationLog: RiskEvaluationLog = {
          evaluatedAt: event.timestamp,
          newScore: event.riskScore || 0,
          factors: event.factors || [],
          triggeredRules: event.factors?.map((f) => f.rule) || [],
          evaluatedBy: event.userId,
        };

        riskRecord.evaluationHistory = [...riskRecord.evaluationHistory, evaluationLog];
        await this.riskRepo.save(riskRecord);
      }
    } catch (error) {
      this.logger.error(`Failed to store evaluation log: ${error.message}`, error.stack);
    }
  }

  /**
   * Log batch evaluation events
   */
  async logBatchEvents(events: RiskEvaluationEvent[]): Promise<void> {
    await Promise.all(events.map((event) => this.logEvent(event)));
  }

  /**
   * Get evaluation history for a transaction
   */
  async getEvaluationHistory(transactionId: string): Promise<RiskEvaluationLog[]> {
    const riskRecord = await this.riskRepo.findOne({
      where: { transactionId },
      select: ['evaluationHistory'],
    });

    return riskRecord?.evaluationHistory || [];
  }

  /**
   * Generate audit report for a time period
   */
  async generateAuditReport(
    from: Date,
    to: Date,
  ): Promise<{
    totalEvaluations: number;
    flaggedCount: number;
    autoBlockedCount: number;
    reviewedCount: number;
    averageRiskScore: number;
    topRiskFactors: Array<{ rule: string; count: number }>;
  }> {
    const riskRecords = await this.riskRepo
      .createQueryBuilder('risk')
      .where('risk.createdAt BETWEEN :from AND :to', { from, to })
      .getMany();

    const totalEvaluations = riskRecords.length;
    const flaggedCount = riskRecords.filter((r) => r.isFlagged).length;
    const reviewedCount = riskRecords.filter(
      (r) => r.reviewStatus !== 'PENDING_REVIEW',
    ).length;
    const autoBlockedCount = riskRecords.filter(
      (r) => r.isFlagged && !r.autoProcessed && r.reviewStatus === 'PENDING_REVIEW',
    ).length;

    const averageRiskScore =
      totalEvaluations > 0
        ? riskRecords.reduce((sum, r) => sum + r.riskScore, 0) / totalEvaluations
        : 0;

    // Count risk factors
    const factorCounts: Record<string, number> = {};
    riskRecords.forEach((record) => {
      record.riskFactors.forEach((factor) => {
        factorCounts[factor.rule] = (factorCounts[factor.rule] || 0) + 1;
      });
    });

    const topRiskFactors = Object.entries(factorCounts)
      .map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEvaluations,
      flaggedCount,
      autoBlockedCount,
      reviewedCount,
      averageRiskScore,
      topRiskFactors,
    };
  }

  /**
   * Format log message for different event types
   */
  private formatLogMessage(event: RiskEvaluationEvent): string {
    const baseMessage = `[Risk Evaluation] ${event.eventType} - Transaction: ${event.transactionId}`;

    switch (event.eventType) {
      case 'EVALUATION_STARTED':
        return `${baseMessage} | User: ${event.userId || 'N/A'} | Device: ${event.deviceId || 'N/A'}`;

      case 'EVALUATION_COMPLETED':
        return `${baseMessage} | Score: ${event.riskScore} | Level: ${event.riskLevel} | Factors: ${
          event.factors?.length || 0
        }`;

      case 'FLAGGED':
        return `${baseMessage} | Score: ${event.riskScore} | Level: ${event.riskLevel} | Factors: ${
          event.factors?.map((f) => f.rule).join(', ') || 'N/A'
        }`;

      case 'AUTO_BLOCKED':
        return `${baseMessage} | Score: ${event.riskScore} | Reason: Auto-blocked due to high risk`;

      case 'REVIEWED':
        return `${baseMessage} | Reviewed by: ${event.userId} | Metadata: ${JSON.stringify(
          event.metadata,
        )}`;

      default:
        return baseMessage;
    }
  }

  /**
   * Export evaluation logs for compliance
   */
  async exportEvaluationLogs(
    from: Date,
    to: Date,
    format: 'json' | 'csv' = 'json',
  ): Promise<string> {
    const riskRecords = await this.riskRepo
      .createQueryBuilder('risk')
      .leftJoinAndSelect('risk.transaction', 'transaction')
      .where('risk.createdAt BETWEEN :from AND :to', { from, to })
      .orderBy('risk.createdAt', 'DESC')
      .getMany();

    if (format === 'csv') {
      return this.convertToCsv(riskRecords);
    }

    return JSON.stringify(
      riskRecords.map((r) => ({
        transactionId: r.transactionId,
        riskScore: r.riskScore,
        riskLevel: r.riskLevel,
        isFlagged: r.isFlagged,
        flagReason: r.flagReason,
        reviewStatus: r.reviewStatus,
        riskFactors: r.riskFactors,
        evaluationHistory: r.evaluationHistory,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      null,
      2,
    );
  }

  /**
   * Convert risk records to CSV format
   */
  private convertToCsv(riskRecords: TransactionRiskEntity[]): string {
    const headers = [
      'transactionId',
      'riskScore',
      'riskLevel',
      'isFlagged',
      'flagReason',
      'reviewStatus',
      'createdAt',
      'updatedAt',
    ];

    const rows = riskRecords.map((r) =>
      [
        r.transactionId,
        r.riskScore,
        r.riskLevel,
        r.isFlagged,
        r.flagReason || '',
        r.reviewStatus,
        r.createdAt.toISOString(),
        r.updatedAt.toISOString(),
      ].join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }
}
