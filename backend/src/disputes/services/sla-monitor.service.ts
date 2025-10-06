import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, Between, DataSource, Raw } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Dispute, DisputeState } from '../entities/dispute.entity';
import {
  TimelineEntry,
  TimelineEntryType,
} from '../entities/timeline-entry.entity';
import { User } from '../entities/user.entity';
import { EmailService } from './email.service';
// Using native Date methods instead of date-fns to avoid type issues
import { disputeConfig } from '../config/dispute.config';

@Injectable()
export class SlaMonitorService {
  private readonly logger = new Logger(SlaMonitorService.name);

  constructor(
    @InjectRepository(Dispute)
    private disputeRepository: Repository<Dispute>,
    @InjectRepository(TimelineEntry)
    private timelineRepository: Repository<TimelineEntry>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectQueue('dispute') private disputeQueue: Queue,
    @InjectQueue('notification') private notificationQueue: Queue,
    private dataSource: DataSource,
    private emailService: EmailService,
  ) {}

  // Manual cron job - call this method periodically
  async checkSlaViolations() {
    this.logger.log('Running SLA violation check...');

    try {
      const now = new Date();

      // Find disputes that are violating SLA
      const slaViolations = await this.disputeRepository.find({
        where: {
          slaDeadline: LessThan(now),
          state: In([
            DisputeState.OPEN,
            DisputeState.INVESTIGATING,
            DisputeState.ESCALATED,
          ]),
        },
        relations: ['user', 'assignedTo', 'transaction'],
      });

      for (const dispute of slaViolations) {
        await this.handleSlaViolation(dispute);
      }

      // Check for disputes approaching SLA deadline (within 2 hours)
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const approachingSla = await this.disputeRepository.find({
        where: {
          slaDeadline: Between(now, twoHoursFromNow),
          state: In([DisputeState.OPEN, DisputeState.INVESTIGATING]),
        },
        relations: ['user', 'assignedTo'],
      });

      for (const dispute of approachingSla) {
        await this.handleApproachingSla(dispute);
      }

      this.logger.log(
        `SLA check completed. Found ${slaViolations.length} violations and ${approachingSla.length} approaching deadlines.`,
      );
    } catch (error) {
      this.logger.error('Error in SLA violation check:', error);
    }
  }

  // Manual cron job - call this method hourly
  async checkStaleDisputes() {
    this.logger.log('Checking for stale disputes...');

    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Find disputes that have been in the same state for too long
      const staleDisputes = await this.disputeRepository.find({
        where: {
          updatedAt: LessThan(thirtyDaysAgo),
          state: In([DisputeState.OPEN, DisputeState.INVESTIGATING]),
        },
        relations: ['user', 'assignedTo'],
      });

      for (const dispute of staleDisputes) {
        await this.handleStaleDispute(dispute);
      }

      this.logger.log(
        `Stale dispute check completed. Found ${staleDisputes.length} stale disputes.`,
      );
    } catch (error) {
      this.logger.error('Error in stale dispute check:', error);
    }
  }

  // Manual cron job - call this method daily at midnight
  async generateSlaReport() {
    this.logger.log('Generating daily SLA report...');

    try {
      // Calculate explicit midnight-to-midnight bounds for the previous calendar day
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(todayStart.getDate() - 1);

      // Get disputes resolved yesterday (full previous calendar day)
      const resolvedDisputes = await this.disputeRepository.find({
        where: {
          state: DisputeState.RESOLVED,
          updatedAt: Between(yesterdayStart, todayStart),
        },
      });

      // Calculate SLA compliance
      const totalResolved = resolvedDisputes.length;
      const withinSla = resolvedDisputes.filter((dispute) => {
        if (!dispute.slaDeadline) return false;
        return dispute.updatedAt <= dispute.slaDeadline;
      }).length;

      const complianceRate =
        totalResolved > 0 ? (withinSla / totalResolved) * 100 : 100;

      // Generate report
      const report = {
        date: yesterdayStart.toISOString().split('T')[0],
        totalResolved,
        withinSla,
        complianceRate: Math.round(complianceRate * 100) / 100,
        avgResolutionTime:
          this.calculateAverageResolutionTime(resolvedDisputes),
      };

      this.logger.log('Daily SLA Report generated successfully');

      // Send report to management
      await this.sendSlaReport(report);
    } catch (error) {
      this.logger.error('Error generating SLA report:', error);
    }
  }

  private async handleSlaViolation(dispute: Dispute): Promise<void> {
    this.logger.log(`Handling SLA violation for dispute ${dispute.id}`);

    // Use a database transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the dispute row to prevent concurrent modifications
      const lockedDispute = await queryRunner.manager.findOne(Dispute, {
        where: { id: dispute.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedDispute) {
        this.logger.log(
          `Dispute ${dispute.id} not found, skipping SLA violation handling`,
        );
        await queryRunner.rollbackTransaction();
        return;
      }

      // Check if this violation has already been processed
      const existingViolation = await queryRunner.manager.findOne(
        TimelineEntry,
        {
          where: {
            disputeId: dispute.id,
            type: TimelineEntryType.SLA_VIOLATION,
            payload: Raw((alias) => `${alias} ->> 'status' = 'processed'`),
          },
        },
      );

      if (existingViolation) {
        this.logger.log(
          `SLA violation already processed for dispute ${dispute.id}`,
        );
        await queryRunner.rollbackTransaction();
        return;
      }

      // Escalate the dispute atomically
      const newEscalationLevel = lockedDispute.escalationLevel + 1;

      await queryRunner.manager.update(Dispute, dispute.id, {
        state: DisputeState.ESCALATED,
        escalationLevel: newEscalationLevel,
        escalationReason: 'SLA violation',
        assignedToId: null, // Unassign for re-assignment
        updatedAt: new Date(),
      });

      // Create timeline entry atomically
      await queryRunner.manager.save(TimelineEntry, {
        disputeId: dispute.id,
        type: TimelineEntryType.SLA_VIOLATION,
        actorType: 'system',
        payload: {
          slaDeadline: lockedDispute.slaDeadline,
          violationTime: new Date(),
          escalationLevel: newEscalationLevel,
          status: 'processed',
        },
      });

      // Commit the transaction
      await queryRunner.commitTransaction();

      // Queue for re-assignment (outside transaction to avoid long-running operations)
      await this.disputeQueue.add('assign-dispute', {
        disputeId: dispute.id,
        escalationLevel: newEscalationLevel,
      });

      // Send notification to managers (outside transaction)
      await this.notificationQueue.add('sla-violation-alert', {
        disputeId: dispute.id,
        slaDeadline: lockedDispute.slaDeadline,
        violationTime: new Date(),
      });

      this.logger.log(
        `SLA violation handled for dispute ${dispute.id}, escalated to level ${newEscalationLevel}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Error handling SLA violation for dispute ${dispute.id}:`,
        error,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async handleApproachingSla(dispute: Dispute): Promise<void> {
    this.logger.log(`Handling approaching SLA for dispute ${dispute.id}`);

    // Use a database transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if we've already sent an alert for this dispute
      const existingAlert = await queryRunner.manager.findOne(TimelineEntry, {
        where: {
          disputeId: dispute.id,
          type: TimelineEntryType.NOTIFICATION,
          payload: Raw((alias) => `${alias} ->> 'type' = 'approaching_sla'`),
        },
      });

      if (existingAlert) {
        this.logger.log(
          `Approaching SLA alert already sent for dispute ${dispute.id}`,
        );
        await queryRunner.rollbackTransaction();
        return;
      }

      // Create timeline entry atomically
      await queryRunner.manager.save(TimelineEntry, {
        disputeId: dispute.id,
        type: TimelineEntryType.NOTIFICATION,
        actorType: 'system',
        payload: {
          type: 'approaching_sla',
          slaDeadline: dispute.slaDeadline,
          hoursRemaining: Math.max(
            0,
            Math.round(
              (dispute.slaDeadline.getTime() - Date.now()) / (1000 * 60 * 60),
            ),
          ),
        },
      });

      // Commit the transaction
      await queryRunner.commitTransaction();

      // Notify assigned agent (outside transaction)
      if (dispute.assignedToId) {
        await this.notificationQueue.add('approaching-sla', {
          agentId: dispute.assignedToId,
          disputeId: dispute.id,
          slaDeadline: dispute.slaDeadline,
        });
      }

      this.logger.log(`Approaching SLA alert sent for dispute ${dispute.id}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Error handling approaching SLA for dispute ${dispute.id}:`,
        error,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async handleStaleDispute(dispute: Dispute): Promise<void> {
    this.logger.log(`Handling stale dispute ${dispute.id}`);

    // Use a database transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the dispute row to prevent concurrent modifications
      const lockedDispute = await queryRunner.manager.findOne(Dispute, {
        where: { id: dispute.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedDispute) {
        this.logger.log(
          `Dispute ${dispute.id} not found, skipping stale dispute handling`,
        );
        await queryRunner.rollbackTransaction();
        return;
      }

      // Check if we've already handled this stale dispute
      const existingHandling = await queryRunner.manager.findOne(
        TimelineEntry,
        {
          where: {
            disputeId: dispute.id,
            type: TimelineEntryType.ESCALATION,
            payload: Raw((alias) => `${alias} ->> 'reason' = 'stale_dispute'`),
          },
        },
      );

      if (existingHandling) {
        this.logger.log(
          `Stale dispute already handled for dispute ${dispute.id}`,
        );
        await queryRunner.rollbackTransaction();
        return;
      }

      // Escalate stale dispute atomically
      const newEscalationLevel = lockedDispute.escalationLevel + 1;

      await queryRunner.manager.update(Dispute, dispute.id, {
        state: DisputeState.ESCALATED,
        escalationLevel: newEscalationLevel,
        escalationReason: 'Stale dispute - no activity for 30 days',
        assignedToId: null,
        updatedAt: new Date(),
      });

      // Create timeline entry atomically
      await queryRunner.manager.save(TimelineEntry, {
        disputeId: dispute.id,
        type: TimelineEntryType.ESCALATION,
        actorType: 'system',
        payload: {
          reason: 'stale_dispute',
          escalationLevel: newEscalationLevel,
          lastActivity: lockedDispute.updatedAt,
        },
      });

      // Commit the transaction
      await queryRunner.commitTransaction();

      // Queue for re-assignment (outside transaction)
      await this.disputeQueue.add('assign-dispute', {
        disputeId: dispute.id,
        escalationLevel: newEscalationLevel,
      });

      this.logger.log(
        `Stale dispute ${dispute.id} escalated to level ${newEscalationLevel}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error handling stale dispute ${dispute.id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private calculateAverageResolutionTime(disputes: Dispute[]): number {
    if (disputes.length === 0) return 0;

    const totalTime = disputes.reduce((sum, dispute) => {
      const resolutionTime =
        dispute.updatedAt.getTime() - dispute.createdAt.getTime();
      return sum + resolutionTime;
    }, 0);

    return Math.round(totalTime / disputes.length / (1000 * 60 * 60)); // Return in hours
  }

  private async sendSlaReport(report: any): Promise<void> {
    try {
      // Get management users (agents)
      const managementUsers = await this.userRepository.find({
        where: { isAgent: true },
        select: ['id', 'email', 'name', 'isAgent'],
      });

      if (managementUsers.length === 0) {
        this.logger.warn('No management users found for SLA report delivery');
        return;
      }

      // Generate HTML report
      const htmlReport = this.generateHtmlReport(report);

      // Send email to all management users
      const emailPromises = managementUsers.map((user) =>
        this.emailService.sendEmail({
          to: user.email,
          subject: `Daily SLA Report - ${new Date().toLocaleDateString()}`,
          html: htmlReport,
          text: this.generateTextReport(report),
        }),
      );

      await Promise.all(emailPromises);

      this.logger.log(
        `SLA report sent to ${managementUsers.length} management users`,
      );
    } catch (error) {
      this.logger.error('Error sending SLA report:', error);
    }
  }

  private generateHtmlReport(report: any): string {
    const currentDate = new Date().toLocaleDateString();

    return `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
    Daily SLA Report - ${currentDate}
  </h2>
  
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h3 style="color: #495057; margin-top: 0;">📊 Summary</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div>
        <strong>Total Disputes:</strong> ${report.total}<br>
        <strong>Resolved:</strong> ${report.totalResolved}<br>
        <strong>Within SLA:</strong> ${report.withinSla}
      </div>
      <div>
        <strong>Compliance Rate:</strong> ${report.complianceRate}%<br>
        <strong>Avg Resolution Time:</strong> ${report.avgResolutionTime} hours
      </div>
    </div>
  </div>

  <div style="background-color: #e8f5e8; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
    <h4 style="color: #155724; margin-top: 0;">✅ SLA Performance</h4>
    <p style="margin: 0;">
      ${
        report.complianceRate >= 95
          ? 'Excellent SLA compliance maintained!'
          : report.complianceRate >= 90
            ? 'Good SLA compliance, room for improvement'
            : 'SLA compliance needs immediate attention'
      }
    </p>
  </div>

  <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px;">
    <h4 style="color: #856404; margin-top: 0;">⚠️ Recommendations</h4>
    <ul style="margin: 0;">
      ${report.complianceRate < 95 ? '<li>Review dispute assignment process</li>' : ''}
      ${report.avgResolutionTime > 24 ? '<li>Optimize resolution workflow</li>' : ''}
      <li>Monitor dispute escalation patterns</li>
      <li>Review agent workload distribution</li>
    </ul>
  </div>

  <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
  
  <p style="color: #6c757d; font-size: 12px; text-align: center;">
    This report was automatically generated by the NexaFx Dispute Management System.
  </p>
</div>
    `;
  }

  private generateTextReport(report: any): string {
    const currentDate = new Date().toLocaleDateString();

    return `
Daily SLA Report - ${currentDate}

SUMMARY:
- Total Disputes: ${report.total}
- Resolved: ${report.totalResolved}
- Within SLA: ${report.withinSla}
- Compliance Rate: ${report.complianceRate}%
- Avg Resolution Time: ${report.avgResolutionTime} hours

SLA PERFORMANCE:
${
  report.complianceRate >= 95
    ? 'Excellent SLA compliance maintained!'
    : report.complianceRate >= 90
      ? 'Good SLA compliance, room for improvement'
      : 'SLA compliance needs immediate attention'
}

RECOMMENDATIONS:
${report.complianceRate < 95 ? '- Review dispute assignment process' : ''}
${report.avgResolutionTime > 24 ? '- Optimize resolution workflow' : ''}
- Monitor dispute escalation patterns
- Review agent workload distribution

Generated by NexaFx Dispute Management System
    `.trim();
  }

  calculateSlaDeadline(
    priority: string,
    category: string,
    createdAt: Date,
  ): Date {
    let hoursToAdd = 24; // Default

    switch (priority) {
      case 'critical':
        hoursToAdd = disputeConfig.sla.escalatedResolution / (1000 * 60 * 60);
        break;
      case 'high':
        hoursToAdd = disputeConfig.sla.complexResolution / (1000 * 60 * 60);
        break;
      case 'medium':
        hoursToAdd = disputeConfig.sla.simpleResolution / (1000 * 60 * 60);
        break;
      case 'low':
        hoursToAdd = 48; // 2 days
        break;
    }

    // Adjust for business hours if enabled
    if (disputeConfig.businessHours.enabled) {
      return this.calculateBusinessHoursDeadline(createdAt, hoursToAdd);
    }

    return new Date(createdAt.getTime() + hoursToAdd * 60 * 60 * 1000);
  }

  private calculateBusinessHoursDeadline(
    startDate: Date,
    hoursToAdd: number,
  ): Date {
    let currentDate = new Date(startDate);
    let remainingHours = hoursToAdd;

    while (remainingHours > 0) {
      const currentDay = currentDate.getDay();

      // Skip weekends
      if (currentDay === 0 || currentDay === 6) {
        currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
        continue;
      }

      // Check if it's within business hours
      const currentHour = currentDate.getHours();
      const businessStart = 9;
      const businessEnd = 17;

      if (currentHour < businessStart) {
        // Before business hours, start at business start
        currentDate = new Date(currentDate);
        currentDate.setHours(businessStart, 0, 0, 0);
      } else if (currentHour >= businessEnd) {
        // After business hours, move to next business day
        currentDate = new Date(
          currentDate.getTime() +
            (24 - currentHour + businessStart) * 60 * 60 * 1000,
        );
        continue;
      }

      // Calculate how many business hours are left today
      const currentHourInDay = currentDate.getHours();
      const minutesOffset = currentDate.getMinutes() / 60;
      const hoursLeftToday = businessEnd - currentHourInDay - minutesOffset;
      const hoursToUse = Math.min(remainingHours, hoursLeftToday);

      currentDate = new Date(
        currentDate.getTime() + hoursToUse * 60 * 60 * 1000,
      );
      remainingHours -= hoursToUse;

      // If we've used all hours for today, move to next day
      if (remainingHours > 0) {
        currentDate = new Date(
          currentDate.getTime() +
            (24 - currentDate.getHours() + businessStart) * 60 * 60 * 1000,
        );
      }
    }

    return currentDate;
  }
}
