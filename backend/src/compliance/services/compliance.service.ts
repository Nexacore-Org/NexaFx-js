import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycService } from '../../kyc/services/kyc.service';
import { RedisService } from './redis.service';

import { TransactionLimit } from '../entities/transaction-limit.entity';
import { ComplianceTransaction, TransactionDirection, TransactionStatus } from '../entities/compliance-transaction.entity';
import { ComplianceEvent, ComplianceEventType, ComplianceEventSeverity } from '../entities/compliance-event.entity';
import { UserFreeze, FreezeReason } from '../entities/user-freeze.entity';
import { UserWhitelist } from '../entities/user-whitelist.entity';
import { KycTier } from '../../kyc/entities/kyc-submission.entity';

export interface TransactionCheckRequest {
  userId: string;
  amount: number;
  currency: string;
  recipientId?: string;
  recipientAccount?: string;
  recipientBank?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  geoLocation?: string;
}

export interface TransactionCheckResponse {
  allowed: boolean;
  reason?: string;
  riskScore: number;
  riskFactors: Record<string, any>;
  complianceChecks: Record<string, any>;
  limits: {
    dailyUsed: number;
    dailyLimit: number;
    weeklyUsed: number;
    weeklyLimit: number;
    monthlyUsed: number;
    monthlyLimit: number;
    singleTransactionLimit: number;
  };
  requiresReview: boolean;
  blockedReason?: string;
}

export interface RiskAssessmentResult {
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: Array<{
    factor: string;
    score: number;
    description: string;
  }>;
}

@Injectable()
export class ComplianceService {
  constructor(
    @InjectRepository(TransactionLimit)
    private transactionLimitRepository: Repository<TransactionLimit>,
    @InjectRepository(ComplianceTransaction)
    private complianceTransactionRepository: Repository<ComplianceTransaction>,
    @InjectRepository(ComplianceEvent)
    private complianceEventRepository: Repository<ComplianceEvent>,
    @InjectRepository(UserFreeze)
    private userFreezeRepository: Repository<UserFreeze>,
    @InjectRepository(UserWhitelist)
    private userWhitelistRepository: Repository<UserWhitelist>,
    private kycService: KycService,
    private redisService: RedisService,
  ) {}

  async checkTransactionCompliance(request: TransactionCheckRequest): Promise<TransactionCheckResponse> {
    const { userId, amount, recipientId } = request;

    // Check if user account is frozen
    const isFrozen = await this.checkUserFrozen(userId);
    if (isFrozen) {
      return {
        allowed: false,
        reason: 'Account is frozen for compliance review',
        riskScore: 100,
        riskFactors: {},
        complianceChecks: { frozen: true },
        limits: await this.getUserLimits(userId),
        requiresReview: true,
        blockedReason: 'ACCOUNT_FROZEN',
      };
    }

    // Get user KYC tier
    const kycStatus = await this.kycService.getKycStatus(userId);
    const kycTier = kycStatus.tier;

    // Get applicable limits
    const limits = await this.getUserLimits(userId);
    const currentUsage = await this.redisService.getTransactionLimits(userId);

    // Check transaction limits
    const limitCheck = await this.checkTransactionLimits(amount, limits, currentUsage);
    if (!limitCheck.allowed) {
      await this.logComplianceEvent(userId, ComplianceEventType.LIMIT_CHECK, ComplianceEventSeverity.HIGH,
        `Transaction blocked: ${limitCheck.reason}`, { amount, limits, currentUsage });

      return {
        allowed: false,
        reason: limitCheck.reason,
        riskScore: 80,
        riskFactors: { limitExceeded: true },
        complianceChecks: { limits: limitCheck },
        limits: { ...currentUsage, ...limits },
        requiresReview: true,
        blockedReason: 'LIMIT_EXCEEDED',
      };
    }

    // Perform risk assessment
    const riskAssessment = await this.assessTransactionRisk(request);
    const isHighRisk = riskAssessment.score >= 70;

    // Check velocity patterns
    const velocityScore = recipientId ? await this.redisService.trackTransactionVelocity(userId, amount, recipientId) : 0;
    const highVelocity = velocityScore > 10; // More than 10 transactions per hour to same recipient

    // Check if recipient is whitelisted
    const isWhitelisted = recipientId ? await this.checkWhitelistStatus(userId, recipientId) : false;

    // Sanctions screening
    const sanctionsCheck = await this.performSanctionsScreening(request);

    // PEP screening
    const pepCheck = await this.performPEPScreening(request);

    // Determine if transaction should be flagged for review
    const requiresReview = isHighRisk || highVelocity || sanctionsCheck.hit || pepCheck.hit || !isWhitelisted;

    // Create compliance transaction record
    const complianceTransaction = await this.createComplianceTransaction({
      ...request,
      riskScore: riskAssessment.score,
      riskFactors: riskAssessment.factors,
      complianceChecks: {
        sanctions: sanctionsCheck,
        pep: pepCheck,
        velocity: velocityScore,
        whitelisted: isWhitelisted,
      },
      status: requiresReview ? TransactionStatus.FLAGGED : TransactionStatus.COMPLETED,
    });

    // Log compliance events
    if (requiresReview) {
      await this.logComplianceEvent(
        userId,
        ComplianceEventType.TRANSACTION_FLAGGED,
        ComplianceEventSeverity.HIGH,
        `Transaction flagged for review: Risk score ${riskAssessment.score}, velocity ${velocityScore}`,
        { transactionId: complianceTransaction.id, riskAssessment, velocityScore }
      );
    }

    await this.logComplianceEvent(
      userId,
      ComplianceEventType.RISK_ASSESSMENT,
      isHighRisk ? ComplianceEventSeverity.HIGH : ComplianceEventSeverity.LOW,
      `Risk assessment completed: Score ${riskAssessment.score}`,
      { riskAssessment }
    );

    return {
      allowed: !requiresReview,
      reason: requiresReview ? 'Transaction requires manual review' : undefined,
      riskScore: riskAssessment.score,
      riskFactors: riskAssessment.factors,
      complianceChecks: {
        sanctions: sanctionsCheck,
        pep: pepCheck,
        velocity: velocityScore,
        whitelisted: isWhitelisted,
      },
      limits: { ...currentUsage, ...limits },
      requiresReview,
      blockedReason: requiresReview ? 'REQUIRES_REVIEW' : undefined,
    };
  }

  async recordTransaction(transactionId: string, request: TransactionCheckRequest): Promise<void> {
    // Update Redis with transaction amount for limit tracking
    await this.redisService.updateTransactionLimits(request.userId, request.amount);

    // Update compliance transaction status to completed
    await this.complianceTransactionRepository.update(
      { transactionId },
      { status: TransactionStatus.COMPLETED }
    );
  }

  async getUserLimits(userId: string): Promise<any> {
    const kycStatus = await this.kycService.getKycStatus(userId);
    const kycTier = kycStatus.tier;

    // Default limits based on CBN guidelines
    const defaultLimits = {
      [KycTier.TIER_1]: {
        dailyLimit: 50000,
        weeklyLimit: 200000,
        monthlyLimit: 1000000,
        singleTransactionLimit: 50000,
        maxDailyTransactions: 10,
        maxWeeklyTransactions: 50,
        maxMonthlyTransactions: 200,
      },
      [KycTier.TIER_2]: {
        dailyLimit: 200000,
        weeklyLimit: 1000000,
        monthlyLimit: 5000000,
        singleTransactionLimit: 200000,
        maxDailyTransactions: 20,
        maxWeeklyTransactions: 100,
        maxMonthlyTransactions: 500,
      },
      [KycTier.TIER_3]: {
        dailyLimit: 1000000,
        weeklyLimit: 5000000,
        monthlyLimit: 25000000,
        singleTransactionLimit: 1000000,
        maxDailyTransactions: 50,
        maxWeeklyTransactions: 250,
        maxMonthlyTransactions: 1000,
      },
    };

    return defaultLimits[kycTier] || defaultLimits[KycTier.TIER_0];
  }

  private async checkTransactionLimits(
    amount: number,
    limits: any,
    currentUsage: any
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check single transaction limit
    if (amount > limits.singleTransactionLimit) {
      return {
        allowed: false,
        reason: `Amount exceeds single transaction limit of ₦${limits.singleTransactionLimit.toLocaleString()}`,
      };
    }

    // Check daily limits
    if (currentUsage.daily + amount > limits.dailyLimit) {
      return {
        allowed: false,
        reason: `Amount would exceed daily limit of ₦${limits.dailyLimit.toLocaleString()}`,
      };
    }

    // Check weekly limits
    if (currentUsage.weekly + amount > limits.weeklyLimit) {
      return {
        allowed: false,
        reason: `Amount would exceed weekly limit of ₦${limits.weeklyLimit.toLocaleString()}`,
      };
    }

    // Check monthly limits
    if (currentUsage.monthly + amount > limits.monthlyLimit) {
      return {
        allowed: false,
        reason: `Amount would exceed monthly limit of ₦${limits.monthlyLimit.toLocaleString()}`,
      };
    }

    // Check transaction count limits
    if (currentUsage.transactionCount.daily + 1 > limits.maxDailyTransactions) {
      return {
        allowed: false,
        reason: `Transaction count would exceed daily limit of ${limits.maxDailyTransactions}`,
      };
    }

    return { allowed: true };
  }

  private async assessTransactionRisk(request: TransactionCheckRequest): Promise<RiskAssessmentResult> {
    const { userId, amount, recipientId, ipAddress, geoLocation } = request;
    let score = 0;
    const factors: Array<{ factor: string; score: number; description: string }> = [];

    // Amount-based risk
    if (amount > 100000) {
      score += 30;
      factors.push({
        factor: 'HIGH_AMOUNT',
        score: 30,
        description: 'Transaction amount exceeds ₦100,000',
      });
    } else if (amount > 50000) {
      score += 15;
      factors.push({
        factor: 'MEDIUM_AMOUNT',
        score: 15,
        description: 'Transaction amount between ₦50,000-₦100,000',
      });
    }

    // New recipient risk
    if (recipientId) {
      const recentTransactions = await this.complianceTransactionRepository.count({
        where: { userId, recipientId },
      });

      if (recentTransactions === 0) {
        score += 20;
        factors.push({
          factor: 'NEW_RECIPIENT',
          score: 20,
          description: 'First transaction to this recipient',
        });
      }
    }

    // Geographic risk
    if (geoLocation && !geoLocation.includes('Nigeria')) {
      score += 25;
      factors.push({
        factor: 'INTERNATIONAL',
        score: 25,
        description: 'International transaction detected',
      });
    }

    // IP-based risk
    if (ipAddress) {
      // Check for VPN/Proxy indicators (simplified)
      if (ipAddress.startsWith('10.') || ipAddress.startsWith('192.168.')) {
        score += 15;
        factors.push({
          factor: 'PRIVATE_IP',
          score: 15,
          description: 'Transaction from private IP address',
        });
      }
    }

    // Determine risk level
    let level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (score >= 80) level = 'CRITICAL';
    else if (score >= 60) level = 'HIGH';
    else if (score >= 30) level = 'MEDIUM';
    else level = 'LOW';

    return { score, level, factors };
  }

  private async checkUserFrozen(userId: string): Promise<boolean> {
    const activeFreezes = await this.userFreezeRepository.count({
      where: {
        userId,
        status: 'ACTIVE',
      },
    });

    return activeFreezes > 0;
  }

  private async checkWhitelistStatus(userId: string, recipientId: string): Promise<boolean> {
    const whitelistEntry = await this.userWhitelistRepository.findOne({
      where: {
        userId,
        recipientId,
        status: 'ACTIVE',
      },
    });

    return !!whitelistEntry;
  }

  private async performSanctionsScreening(request: TransactionCheckRequest): Promise<{ hit: boolean; details?: any }> {
    // This would integrate with external sanctions APIs
    // For now, return no hits (would be implemented with real sanctions data)
    return { hit: false };
  }

  private async performPEPScreening(request: TransactionCheckRequest): Promise<{ hit: boolean; details?: any }> {
    // This would integrate with PEP databases
    // For now, return no hits (would be implemented with real PEP data)
    return { hit: false };
  }

  private async createComplianceTransaction(data: any): Promise<ComplianceTransaction> {
    const transaction = this.complianceTransactionRepository.create(data);
    return await this.complianceTransactionRepository.save(transaction);
  }

  private async logComplianceEvent(
    userId: string,
    eventType: ComplianceEventType,
    severity: ComplianceEventSeverity,
    description: string,
    metadata?: any,
    transactionId?: string
  ): Promise<void> {
    const event = this.complianceEventRepository.create({
      userId,
      transactionId,
      eventType,
      severity,
      description,
      metadata,
      requiresAction: severity === ComplianceEventSeverity.HIGH || severity === ComplianceEventSeverity.CRITICAL,
    });

    await this.complianceEventRepository.save(event);
  }

  async freezeUser(userId: string, reason: FreezeReason, description: string, frozenBy: string): Promise<void> {
    const freeze = this.userFreezeRepository.create({
      userId,
      reason,
      description,
      frozenBy,
      frozenAt: new Date(),
      isPermanent: false,
    });

    await this.userFreezeRepository.save(freeze);

    await this.logComplianceEvent(
      userId,
      ComplianceEventType.ACCOUNT_FROZEN,
      ComplianceEventSeverity.CRITICAL,
      `Account frozen: ${description}`,
      { reason, frozenBy }
    );
  }

  async unfreezeUser(userId: string, liftedBy: string, notes?: string): Promise<void> {
    await this.userFreezeRepository.update(
      { userId, status: 'ACTIVE' },
      {
        status: 'LIFTED',
        liftedBy,
        liftedAt: new Date(),
        liftNotes: notes,
      }
    );

    await this.logComplianceEvent(
      userId,
      ComplianceEventType.ACCOUNT_UNFROZEN,
      ComplianceEventSeverity.HIGH,
      `Account unfrozen: ${notes || 'No notes provided'}`,
      { liftedBy, notes }
    );
  }
}
