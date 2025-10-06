import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ComplianceEvent, ComplianceEventType, ComplianceEventSeverity } from '../entities/compliance-event.entity';
import { UserFreeze } from '../entities/user-freeze.entity';
import { RedisService } from './redis.service';

@Injectable()
export class ComplianceSchedulerService {
  private readonly logger = new Logger(ComplianceSchedulerService.name);

  constructor(
    @InjectRepository(ComplianceEvent)
    private complianceEventRepository: Repository<ComplianceEvent>,
    @InjectRepository(UserFreeze)
    private userFreezeRepository: Repository<UserFreeze>,
    private redisService: RedisService,
  ) {}

  // Reset daily transaction limits at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async resetDailyLimits(): Promise<void> {
    this.logger.log('Starting daily limit reset process');

    try {
      // Daily limits are automatically reset by Redis TTL
      // This job mainly logs the reset and performs cleanup

      await this.logSystemEvent(
        ComplianceEventType.LIMIT_CHECK,
        ComplianceEventSeverity.LOW,
        'Daily transaction limits reset completed'
      );

      this.logger.log('Daily limit reset completed successfully');
    } catch (error) {
      this.logger.error('Failed to reset daily limits', error);
      await this.logSystemEvent(
        ComplianceEventType.LIMIT_CHECK,
        ComplianceEventSeverity.HIGH,
        `Daily limit reset failed: ${error.message}`
      );
    }
  }

  // Reset weekly transaction limits on Monday at midnight
  @Cron('0 0 * * 1') // Every Monday at midnight
  async resetWeeklyLimits(): Promise<void> {
    this.logger.log('Starting weekly limit reset process');

    try {
      // Weekly limits are automatically reset by Redis TTL
      // This job mainly logs the reset and performs cleanup

      await this.logSystemEvent(
        ComplianceEventType.LIMIT_CHECK,
        ComplianceEventSeverity.LOW,
        'Weekly transaction limits reset completed'
      );

      this.logger.log('Weekly limit reset completed successfully');
    } catch (error) {
      this.logger.error('Failed to reset weekly limits', error);
      await this.logSystemEvent(
        ComplianceEventType.LIMIT_CHECK,
        ComplianceEventSeverity.HIGH,
        `Weekly limit reset failed: ${error.message}`
      );
    }
  }

  // Reset monthly transaction limits on the 1st day of each month at midnight
  @Cron('0 0 1 * *') // First day of every month at midnight
  async resetMonthlyLimits(): Promise<void> {
    this.logger.log('Starting monthly limit reset process');

    try {
      // Monthly limits are automatically reset by Redis TTL
      // This job mainly logs the reset and performs cleanup

      await this.logSystemEvent(
        ComplianceEventType.LIMIT_CHECK,
        ComplianceEventSeverity.LOW,
        'Monthly transaction limits reset completed'
      );

      this.logger.log('Monthly limit reset completed successfully');
    } catch (error) {
      this.logger.error('Failed to reset monthly limits', error);
      await this.logSystemEvent(
        ComplianceEventType.LIMIT_CHECK,
        ComplianceEventSeverity.HIGH,
        `Monthly limit reset failed: ${error.message}`
      );
    }
  }

  // Clean up expired temporary freezes daily
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async cleanupExpiredFreezes(): Promise<void> {
    this.logger.log('Starting cleanup of expired temporary freezes');

    try {
      const expiredFreezes = await this.userFreezeRepository.find({
        where: {
          status: 'ACTIVE',
          isPermanent: false,
          expiresAt: LessThan(new Date()),
        },
      });

      for (const freeze of expiredFreezes) {
        await this.userFreezeRepository.update(freeze.id, {
          status: 'EXPIRED',
        });

        await this.logComplianceEvent(
          freeze.userId,
          ComplianceEventType.ACCOUNT_UNFROZEN,
          ComplianceEventSeverity.MEDIUM,
          `Temporary account freeze expired and automatically lifted`,
          { freezeId: freeze.id, reason: freeze.reason }
        );
      }

      this.logger.log(`Cleaned up ${expiredFreezes.length} expired freezes`);
    } catch (error) {
      this.logger.error('Failed to cleanup expired freezes', error);
    }
  }

  // Generate daily compliance summary report
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async generateDailyComplianceReport(): Promise<void> {
    this.logger.log('Generating daily compliance summary report');

    try {
      // Get statistics for the previous day
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const [
        totalTransactions,
        flaggedTransactions,
        blockedTransactions,
        newFreezes,
        resolvedEvents,
      ] = await Promise.all([
        this.getTransactionCount(yesterday),
        this.getFlaggedTransactionCount(yesterday),
        this.getBlockedTransactionCount(yesterday),
        this.getNewFreezesCount(yesterday),
        this.getResolvedEventsCount(yesterday),
      ]);

      await this.logSystemEvent(
        ComplianceEventType.COMPLIANCE_REVIEW,
        ComplianceEventSeverity.LOW,
        'Daily compliance report generated',
        {
          date: yesterday.toISOString().split('T')[0],
          statistics: {
            totalTransactions,
            flaggedTransactions,
            blockedTransactions,
            newFreezes,
            resolvedEvents,
          },
        }
      );

      this.logger.log('Daily compliance report generated successfully');
    } catch (error) {
      this.logger.error('Failed to generate daily compliance report', error);
    }
  }

  // Clean up old resolved events (older than 90 days)
  @Cron('0 0 */7 * *') // Every 7 days at midnight
  async cleanupOldResolvedEvents(): Promise<void> {
    this.logger.log('Starting cleanup of old resolved compliance events');

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 days ago

      const result = await this.complianceEventRepository.delete({
        isResolved: true,
        resolvedAt: LessThan(cutoffDate),
      });

      this.logger.log(`Cleaned up ${result.affected} old resolved events`);
    } catch (error) {
      this.logger.error('Failed to cleanup old resolved events', error);
    }
  }

  // Health check for external compliance services
  @Cron('0 */6 * * *') // Every 6 hours
  async checkExternalServices(): Promise<void> {
    this.logger.log('Checking external compliance services health');

    try {
      // Check Redis connectivity
      await this.redisService.get('health-check');

      // Check database connectivity
      await this.complianceEventRepository.count();

      await this.logSystemEvent(
        ComplianceEventType.COMPLIANCE_REVIEW,
        ComplianceEventSeverity.LOW,
        'External services health check passed'
      );

      this.logger.log('External services health check completed');
    } catch (error) {
      this.logger.error('External services health check failed', error);
      await this.logSystemEvent(
        ComplianceEventType.COMPLIANCE_REVIEW,
        ComplianceEventSeverity.HIGH,
        `External services health check failed: ${error.message}`
      );
    }
  }

  private async getTransactionCount(date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return await this.complianceEventRepository.count({
      where: {
        eventType: ComplianceEventType.RISK_ASSESSMENT,
        createdAt: { $gte: startOfDay, $lte: endOfDay } as any,
      },
    });
  }

  private async getFlaggedTransactionCount(date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return await this.complianceEventRepository.count({
      where: {
        eventType: ComplianceEventType.TRANSACTION_FLAGGED,
        createdAt: { $gte: startOfDay, $lte: endOfDay } as any,
      },
    });
  }

  private async getBlockedTransactionCount(date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return await this.complianceEventRepository.count({
      where: {
        eventType: ComplianceEventType.TRANSACTION_BLOCKED,
        createdAt: { $gte: startOfDay, $lte: endOfDay } as any,
      },
    });
  }

  private async getNewFreezesCount(date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return await this.userFreezeRepository.count({
      where: {
        frozenAt: { $gte: startOfDay, $lte: endOfDay } as any,
      },
    });
  }

  private async getResolvedEventsCount(date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return await this.complianceEventRepository.count({
      where: {
        isResolved: true,
        resolvedAt: { $gte: startOfDay, $lte: endOfDay } as any,
      },
    });
  }

  private async logSystemEvent(
    eventType: ComplianceEventType,
    severity: ComplianceEventSeverity,
    description: string,
    metadata?: any
  ): Promise<void> {
    const event = this.complianceEventRepository.create({
      userId: 'SYSTEM',
      eventType,
      severity,
      description,
      metadata,
    });

    await this.complianceEventRepository.save(event);
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
    });

    await this.complianceEventRepository.save(event);
  }
}
