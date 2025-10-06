import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
  ParseUUIDPipe,
  ParseBoolPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ComplianceService } from './services/compliance.service';
import { RedisService } from './services/redis.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceTransaction, TransactionStatus } from './entities/compliance-transaction.entity';
import { ComplianceEvent } from './entities/compliance-event.entity';
import { SuspiciousActivityReport, SARStatus } from './entities/suspicious-activity-report.entity';
import { UserFreeze, FreezeReason } from './entities/user-freeze.entity';
import { UserWhitelist, WhitelistStatus } from './entities/user-whitelist.entity';

@Controller('compliance')
export class ComplianceController {
  constructor(
    private readonly complianceService: ComplianceService,
    private readonly redisService: RedisService,
    @InjectRepository(ComplianceTransaction)
    private complianceTransactionRepository: Repository<ComplianceTransaction>,
    @InjectRepository(ComplianceEvent)
    private complianceEventRepository: Repository<ComplianceEvent>,
    @InjectRepository(SuspiciousActivityReport)
    private sarRepository: Repository<SuspiciousActivityReport>,
    @InjectRepository(UserFreeze)
    private userFreezeRepository: Repository<UserFreeze>,
    @InjectRepository(UserWhitelist)
    private userWhitelistRepository: Repository<UserWhitelist>,
  ) {}

  // GET /compliance/limits/:userId - Get user's transaction limits based on KYC tier
  @Get('limits/:userId')
  async getUserLimits(@Param('userId', ParseUUIDPipe) userId: string) {
    try {
      const limits = await this.complianceService.getUserLimits(userId);
      const currentUsage = await this.redisService.getTransactionLimits(userId);

      return {
        limits,
        currentUsage,
        remaining: {
          daily: limits.dailyLimit - currentUsage.daily,
          weekly: limits.weeklyLimit - currentUsage.weekly,
          monthly: limits.monthlyLimit - currentUsage.monthly,
        },
      };
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve user limits',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // POST /compliance/limits/check - Check if transaction is within limits
  @Post('limits/check')
  async checkTransactionLimits(@Body() request: any) {
    try {
      return await this.complianceService.checkTransactionCompliance(request);
    } catch (error) {
      throw new HttpException(
        'Failed to check transaction compliance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /compliance/limits/remaining/:userId - Get remaining daily/monthly limits
  @Get('limits/remaining/:userId')
  async getRemainingLimits(@Param('userId', ParseUUIDPipe) userId: string) {
    try {
      const limits = await this.complianceService.getUserLimits(userId);
      const currentUsage = await this.redisService.getTransactionLimits(userId);

      return {
        remaining: {
          daily: Math.max(0, limits.dailyLimit - currentUsage.daily),
          weekly: Math.max(0, limits.weeklyLimit - currentUsage.weekly),
          monthly: Math.max(0, limits.monthlyLimit - currentUsage.monthly),
        },
        transactionCountRemaining: {
          daily: Math.max(0, limits.maxDailyTransactions - currentUsage.transactionCount.daily),
          weekly: Math.max(0, limits.maxWeeklyTransactions - currentUsage.transactionCount.weekly),
          monthly: Math.max(0, limits.maxMonthlyTransactions - currentUsage.transactionCount.monthly),
        },
        resetTimes: {
          daily: new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString(),
          weekly: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          monthly: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
        },
      };
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve remaining limits',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // PATCH /compliance/admin/limits/:userId - Override user limits (admin only)
  @Patch('admin/limits/:userId')
  async overrideUserLimits(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() limits: any,
  ) {
    // Implementation would include admin authorization guard
    try {
      // This would update custom limits for the user
      // For now, return success
      return { success: true, message: 'Limits updated successfully' };
    } catch (error) {
      throw new HttpException(
        'Failed to update user limits',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /compliance/transactions/flagged - Get flagged transactions for review
  @Get('transactions/flagged')
  async getFlaggedTransactions(
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
    @Query('status') status?: TransactionStatus,
  ) {
    try {
      const query = this.complianceTransactionRepository.createQueryBuilder('transaction')
        .where('transaction.status = :status', { status: TransactionStatus.FLAGGED })
        .orderBy('transaction.createdAt', 'DESC');

      if (status) {
        query.andWhere('transaction.status = :status', { status });
      }

      const [transactions, total] = await query
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve flagged transactions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // POST /compliance/transactions/:txId/review - Admin review flagged transaction
  @Post('transactions/:txId/review')
  async reviewFlaggedTransaction(
    @Param('txId', ParseUUIDPipe) txId: string,
    @Body() review: { approve: boolean; notes?: string; reviewedBy: string },
  ) {
    try {
      const transaction = await this.complianceTransactionRepository.findOne({
        where: { id: txId },
      });

      if (!transaction) {
        throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
      }

      await this.complianceTransactionRepository.update(txId, {
        status: review.approve ? TransactionStatus.COMPLETED : TransactionStatus.BLOCKED,
        reviewId: txId,
        reviewedBy: review.reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: review.notes,
      });

      return { success: true, message: 'Transaction review completed' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to review transaction',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /compliance/transactions/:txId/risk-score - Get transaction risk assessment
  @Get('transactions/:txId/risk-score')
  async getTransactionRiskScore(@Param('txId', ParseUUIDPipe) txId: string) {
    try {
      const transaction = await this.complianceTransactionRepository.findOne({
        where: { id: txId },
      });

      if (!transaction) {
        throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
      }

      return {
        riskScore: transaction.riskScore,
        riskFactors: transaction.riskFactors,
        riskLevel: this.getRiskLevel(transaction.riskScore),
        complianceChecks: transaction.complianceChecks,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to retrieve risk score',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // POST /compliance/reports/suspicious-activity - File suspicious activity report (SAR)
  @Post('reports/suspicious-activity')
  async fileSuspiciousActivityReport(@Body() report: any) {
    try {
      const sar = this.sarRepository.create({
        ...report,
        status: SARStatus.DRAFT,
        submittedAt: new Date(),
      });

      const saved = await this.sarRepository.save(sar);
      return { success: true, reportId: saved.id };
    } catch (error) {
      throw new HttpException(
        'Failed to file suspicious activity report',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /compliance/reports/suspicious-activity - Get list of SARs
  @Get('reports/suspicious-activity')
  async getSuspiciousActivityReports(
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
    @Query('status') status?: SARStatus,
  ) {
    try {
      const query = this.sarRepository.createQueryBuilder('sar')
        .orderBy('sar.createdAt', 'DESC');

      if (status) {
        query.where('sar.status = :status', { status });
      }

      const [reports, total] = await query
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return {
        reports,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve SARs',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // POST /compliance/user/:userId/freeze - Freeze user account for compliance review
  @Post('user/:userId/freeze')
  async freezeUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() freezeRequest: { reason: FreezeReason; description: string; frozenBy: string },
  ) {
    try {
      await this.complianceService.freezeUser(
        userId,
        freezeRequest.reason,
        freezeRequest.description,
        freezeRequest.frozenBy,
      );

      return { success: true, message: 'User account frozen successfully' };
    } catch (error) {
      throw new HttpException(
        'Failed to freeze user account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // POST /compliance/user/:userId/unfreeze - Unfreeze user account
  @Post('user/:userId/unfreeze')
  async unfreezeUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() unfreezeRequest: { liftedBy: string; notes?: string },
  ) {
    try {
      await this.complianceService.unfreezeUser(userId, unfreezeRequest.liftedBy, unfreezeRequest.notes);
      return { success: true, message: 'User account unfrozen successfully' };
    } catch (error) {
      throw new HttpException(
        'Failed to unfreeze user account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /compliance/user/:userId/activity-log - Get user's compliance activity history
  @Get('user/:userId/activity-log')
  async getUserActivityLog(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
    @Query('eventType') eventType?: string,
  ) {
    try {
      const query = this.complianceEventRepository.createQueryBuilder('event')
        .where('event.userId = :userId', { userId })
        .orderBy('event.createdAt', 'DESC');

      if (eventType) {
        query.andWhere('event.eventType = :eventType', { eventType });
      }

      const [events, total] = await query
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return {
        events,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve activity log',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // POST /compliance/sanctions/check - Check user/transaction against sanctions lists
  @Post('sanctions/check')
  async checkSanctions(@Body() checkRequest: any) {
    try {
      const result = await this.complianceService.performSanctionsScreening(checkRequest);
      return result;
    } catch (error) {
      throw new HttpException(
        'Failed to perform sanctions check',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /compliance/velocity-check/:userId - Check transaction velocity patterns
  @Get('velocity-check/:userId')
  async getVelocityCheck(@Param('userId', ParseUUIDPipe) userId: string) {
    try {
      const velocityScore = await this.redisService.getUserVelocityScore(userId);
      return {
        velocityScore,
        riskLevel: this.getVelocityRiskLevel(velocityScore),
        recommendation: velocityScore > 10 ? 'REVIEW_REQUIRED' : 'NORMAL',
      };
    } catch (error) {
      throw new HttpException(
        'Failed to perform velocity check',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // POST /compliance/aml/screen - Screen transaction for AML compliance
  @Post('aml/screen')
  async screenAML(@Body() amlRequest: any) {
    try {
      // AML screening logic would be implemented here
      return { passed: true, score: 0 };
    } catch (error) {
      throw new HttpException(
        'Failed to perform AML screening',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /compliance/reports/regulatory - Generate regulatory compliance reports
  @Get('reports/regulatory')
  async generateRegulatoryReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('reportType') reportType: string,
  ) {
    try {
      // Regulatory reporting logic would be implemented here
      return { reportGenerated: true, reportId: 'reg-report-123' };
    } catch (error) {
      throw new HttpException(
        'Failed to generate regulatory report',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // POST /compliance/limits/tier-upgrade - Request tier upgrade (triggers enhanced verification)
  @Post('limits/tier-upgrade')
  async requestTierUpgrade(@Body() upgradeRequest: any) {
    try {
      // Tier upgrade logic would be implemented here
      return { success: true, message: 'Tier upgrade request submitted' };
    } catch (error) {
      throw new HttpException(
        'Failed to process tier upgrade request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /compliance/admin/alerts - Get real-time compliance alerts
  @Get('admin/alerts')
  async getComplianceAlerts(
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
    @Query('severity') severity?: string,
  ) {
    try {
      const query = this.complianceEventRepository.createQueryBuilder('event')
        .where('event.requiresAction = :requiresAction', { requiresAction: true })
        .andWhere('event.isResolved = :isResolved', { isResolved: false })
        .orderBy('event.createdAt', 'DESC');

      if (severity) {
        query.andWhere('event.severity = :severity', { severity });
      }

      const [alerts, total] = await query
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return {
        alerts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve compliance alerts',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /compliance/admin/statistics - Get compliance metrics and statistics
  @Get('admin/statistics')
  async getComplianceStatistics(@Query('period') period: string = '30d') {
    try {
      // Statistics calculation logic would be implemented here
      return {
        period,
        statistics: {
          totalTransactions: 0,
          flaggedTransactions: 0,
          blockedTransactions: 0,
          frozenAccounts: 0,
          sarsFiled: 0,
          averageRiskScore: 0,
        },
      };
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve compliance statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // POST /compliance/whitelist/:userId/add - Add trusted recipient to whitelist
  @Post('whitelist/:userId/add')
  async addToWhitelist(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() whitelistRequest: any,
  ) {
    try {
      const whitelist = this.userWhitelistRepository.create({
        userId,
        ...whitelistRequest,
        status: WhitelistStatus.PENDING,
      });

      const saved = await this.userWhitelistRepository.save(whitelist);
      return { success: true, whitelistId: saved.id };
    } catch (error) {
      throw new HttpException(
        'Failed to add to whitelist',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getRiskLevel(score: number): string {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }

  private getVelocityRiskLevel(score: number): string {
    if (score >= 20) return 'CRITICAL';
    if (score >= 10) return 'HIGH';
    if (score >= 5) return 'MEDIUM';
    return 'LOW';
  }
}
