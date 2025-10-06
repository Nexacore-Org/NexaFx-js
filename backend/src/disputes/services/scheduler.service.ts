import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SlaMonitorService } from './sla-monitor.service';
import { DisputeService } from './dispute.service';
import { disputeConfig } from '../config/dispute.config';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly isRunning = {
    slaMonitoring: false,
    staleDisputeCheck: false,
    dailySlaReport: false,
    autoResolutionCheck: false,
    weeklyCleanup: false,
  };

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
    if (this.isRunning.slaMonitoring) {
      this.logger.warn(
        'Skipping SLA monitoring cron job: previous run still in progress',
      );
      return;
    }

    this.isRunning.slaMonitoring = true;
    try {
      await this.slaMonitorService.checkSlaViolations();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error in SLA monitoring cron job: ${message}`, stack);
    } finally {
      this.isRunning.slaMonitoring = false;
    }
  }

  // Run every hour to check for stale disputes
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'stale-dispute-check',
    timeZone: 'Africa/Lagos',
  })
  async handleStaleDisputeCheck() {
    this.logger.log('Running stale dispute check cron job...');
    if (this.isRunning.staleDisputeCheck) {
      this.logger.warn(
        'Skipping stale dispute check cron job: previous run still in progress',
      );
      return;
    }

    this.isRunning.staleDisputeCheck = true;
    try {
      await this.slaMonitorService.checkStaleDisputes();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error in stale dispute check cron job: ${message}`,
        stack,
      );
    } finally {
      this.isRunning.staleDisputeCheck = false;
    }
  }

  // Run daily at midnight to generate SLA reports
  @Cron('0 0 * * *', {
    name: 'daily-sla-report',
    timeZone: 'Africa/Lagos',
  })
  async handleDailySlaReport() {
    this.logger.log('Running daily SLA report cron job...');
    if (this.isRunning.dailySlaReport) {
      this.logger.warn(
        'Skipping daily SLA report cron job: previous run still in progress',
      );
      return;
    }

    this.isRunning.dailySlaReport = true;
    try {
      await this.slaMonitorService.generateSlaReport();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error in daily SLA report cron job: ${message}`,
        stack,
      );
    } finally {
      this.isRunning.dailySlaReport = false;
    }
  }

  // Run every 30 minutes to trigger auto-resolution for eligible disputes
  @Cron('*/30 * * * *', {
    name: 'auto-resolution-check',
    timeZone: 'Africa/Lagos',
  })
  async handleAutoResolutionCheck() {
    this.logger.log('Running auto-resolution check cron job...');
    if (this.isRunning.autoResolutionCheck) {
      this.logger.warn(
        'Skipping auto-resolution check cron job: previous run still in progress',
      );
      return;
    }

    this.isRunning.autoResolutionCheck = true;
    try {
      await this.triggerAutoResolutionForEligibleDisputes();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error in auto-resolution check cron job: ${message}`,
        stack,
      );
    } finally {
      this.isRunning.autoResolutionCheck = false;
    }
  }

  // Run weekly on Sunday at 2 AM to clean up old data
  @Cron('0 2 * * 0', {
    name: 'weekly-cleanup',
    timeZone: 'Africa/Lagos',
  })
  async handleWeeklyCleanup() {
    this.logger.log('Running weekly cleanup cron job...');
    if (this.isRunning.weeklyCleanup) {
      this.logger.warn(
        'Skipping weekly cleanup cron job: previous run still in progress',
      );
      return;
    }

    this.isRunning.weeklyCleanup = true;
    try {
      await this.cleanupOldData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error in weekly cleanup cron job: ${message}`, stack);
    } finally {
      this.isRunning.weeklyCleanup = false;
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

    // Clean up old audit logs per configured retention
    const retentionMs = disputeConfig.retention.auditLogs;
    const beforeDate = new Date(Date.now() - retentionMs);

    try {
      const deletedAuditCount =
        await this.disputeService.cleanupOldAuditLogs(beforeDate);
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
