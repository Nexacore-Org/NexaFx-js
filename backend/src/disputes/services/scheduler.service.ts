import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SlaMonitorService } from './sla-monitor.service';
import { DisputeService } from './dispute.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private slaMonitorService: SlaMonitorService,
    private disputeService: DisputeService,
  ) {}

  // Run every 15 minutes to check for SLA violations and approaching deadlines
  @Cron('*/15 * * * *', {
    name: 'sla-monitoring',
    timeZone: 'Africa/Lagos',
  })
  async handleSlaMonitoring() {
    this.logger.log('Running SLA monitoring cron job...');

    try {
      await this.slaMonitorService.checkSlaViolations();
    } catch (error) {
      this.logger.error('Error in SLA monitoring cron job:', error);
    }
  }

  // Run every hour to check for stale disputes
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'stale-dispute-check',
    timeZone: 'Africa/Lagos',
  })
  async handleStaleDisputeCheck() {
    this.logger.log('Running stale dispute check cron job...');

    try {
      await this.slaMonitorService.checkStaleDisputes();
    } catch (error) {
      this.logger.error('Error in stale dispute check cron job:', error);
    }
  }

  // Run daily at midnight to generate SLA reports
  @Cron('0 0 * * *', {
    name: 'daily-sla-report',
    timeZone: 'Africa/Lagos',
  })
  async handleDailySlaReport() {
    this.logger.log('Running daily SLA report cron job...');

    try {
      await this.slaMonitorService.generateSlaReport();
    } catch (error) {
      this.logger.error('Error in daily SLA report cron job:', error);
    }
  }

  // Run every 30 minutes to trigger auto-resolution for eligible disputes
  @Cron('*/30 * * * *', {
    name: 'auto-resolution-check',
    timeZone: 'Africa/Lagos',
  })
  async handleAutoResolutionCheck() {
    this.logger.log('Running auto-resolution check cron job...');

    try {
      await this.triggerAutoResolutionForEligibleDisputes();
    } catch (error) {
      this.logger.error('Error in auto-resolution check cron job:', error);
    }
  }

  // Run weekly on Sunday at 2 AM to clean up old data
  @Cron('0 2 * * 0', {
    name: 'weekly-cleanup',
    timeZone: 'Africa/Lagos',
  })
  async handleWeeklyCleanup() {
    this.logger.log('Running weekly cleanup cron job...');

    try {
      await this.cleanupOldData();
    } catch (error) {
      this.logger.error('Error in weekly cleanup cron job:', error);
    }
  }

  private async triggerAutoResolutionForEligibleDisputes(): Promise<void> {
    // Find disputes that are eligible for auto-resolution
    const eligibleDisputes =
      await this.disputeService.getAutoResolvableDisputes();

    for (const dispute of eligibleDisputes) {
      try {
        await this.disputeService.triggerAutoResolve(dispute.id);
        this.logger.log(`Triggered auto-resolution for dispute ${dispute.id}`);
      } catch (error) {
        this.logger.error(
          `Failed to trigger auto-resolution for dispute ${dispute.id}:`,
          error,
        );
      }
    }

    if (eligibleDisputes.length > 0) {
      this.logger.log(
        `Triggered auto-resolution for ${eligibleDisputes.length} disputes`,
      );
    }
  }

  private async cleanupOldData(): Promise<void> {
    // Clean up old resolved disputes (older than 1 year)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    try {
      const deletedCount =
        await this.disputeService.cleanupOldResolvedDisputes(oneYearAgo);
      this.logger.log(`Cleaned up ${deletedCount} old resolved disputes`);
    } catch (error) {
      this.logger.error('Error cleaning up old disputes:', error);
    }

    // Clean up old audit logs (older than 2 years)
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    try {
      const deletedAuditCount =
        await this.disputeService.cleanupOldAuditLogs(twoYearsAgo);
      this.logger.log(`Cleaned up ${deletedAuditCount} old audit logs`);
    } catch (error) {
      this.logger.error('Error cleaning up old audit logs:', error);
    }
  }

  // Manual trigger methods for testing
  async triggerSlaMonitoring(): Promise<void> {
    await this.handleSlaMonitoring();
  }

  async triggerStaleDisputeCheck(): Promise<void> {
    await this.handleStaleDisputeCheck();
  }

  async triggerDailySlaReport(): Promise<void> {
    await this.handleDailySlaReport();
  }

  async triggerAutoResolutionCheck(): Promise<void> {
    await this.handleAutoResolutionCheck();
  }

  async triggerWeeklyCleanup(): Promise<void> {
    await this.handleWeeklyCleanup();
  }
}
