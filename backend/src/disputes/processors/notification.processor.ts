import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { NotificationService } from '../services/notification.service';

@Injectable()
@Processor('notification')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private notificationService: NotificationService,
  ) {
    // Validate FRONTEND_URL environment variable at initialization
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      throw new Error(
        'FRONTEND_URL environment variable is required but not set. Please configure FRONTEND_URL in your environment variables.',
      );
    }

    // Basic URL validation
    try {
      new URL(frontendUrl);
      this.frontendUrl = frontendUrl;
    } catch {
      throw new Error(
        `FRONTEND_URL environment variable contains an invalid URL: "${frontendUrl}". Please provide a valid URL (e.g., https://app.nexafx.com).`,
      );
    }
  }

  @Process('dispute-created')
  async handleDisputeCreated(
    job: Job<{ userId: string; disputeId: string; category: string }>,
  ) {
    const { userId, disputeId, category } = job.data;

    try {
      await this.notificationService.sendDisputeNotification({
        userId,
        disputeId,
        type: 'created',
        category,
      });

      this.logger.log(
        `Dispute created notification sent to user ${userId} for dispute ${disputeId}`,
      );
    } catch (error) {
      this.logger.error(
        'Error sending dispute created notification',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  @Process('dispute-assigned')
  async handleDisputeAssigned(
    job: Job<{
      agentId: string;
      disputeId: string;
      assignedBy: string;
      priority?: string;
    }>,
  ) {
    const { agentId, disputeId, assignedBy, priority } = job.data;

    try {
      await this.notificationService.sendDisputeNotification({
        userId: agentId,
        disputeId,
        type: 'assigned',
        priority,
      });

      this.logger.log(
        `Dispute assignment notification sent to agent ${agentId} for dispute ${disputeId}`,
      );
    } catch (error) {
      this.logger.error(
        'Error sending dispute assignment notification',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  @Process('dispute-resolved')
  async handleDisputeResolved(
    job: Job<{
      userId: string;
      disputeId: string;
      outcome: string;
      refundAmount?: number;
    }>,
  ) {
    const { userId, disputeId, outcome, refundAmount } = job.data;

    try {
      await this.notificationService.sendDisputeNotification({
        userId,
        disputeId,
        type: 'resolved',
        outcome,
        refundAmount,
      });

      this.logger.log(
        `Dispute resolution notification sent to user ${userId} for dispute ${disputeId}`,
      );
    } catch (error) {
      this.logger.error(
        'Error sending dispute resolution notification',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  @Process('dispute-comment')
  async handleDisputeComment(
    job: Job<{
      userId: string;
      disputeId: string;
      commentId: string;
    }>,
  ) {
    const { userId, disputeId, commentId } = job.data;

    try {
      await this.notificationService.sendDisputeNotification({
        userId,
        disputeId,
        type: 'comment',
      });

      this.logger.log(
        `Dispute comment notification sent to user ${userId} for dispute ${disputeId}`,
      );
    } catch (error) {
      this.logger.error(
        'Error sending dispute comment notification',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  @Process('dispute-escalated')
  async handleDisputeEscalated(
    job: Job<{
      disputeId: string;
      reason: string;
      escalationLevel: number;
    }>,
  ) {
    const { disputeId, reason, escalationLevel } = job.data;

    try {
      await this.notificationService.sendBulkNotificationToManagers(
        'escalated',
        disputeId,
        { reason, escalationLevel },
      );

      this.logger.log(
        `Escalation notifications sent for dispute ${disputeId} at level ${escalationLevel}`,
      );
    } catch (error) {
      this.logger.error(
        'Error sending dispute escalation notification',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  @Process('sla-violation-alert')
  async handleSlaViolationAlert(
    job: Job<{
      disputeId: string;
      slaDeadline: Date;
      violationTime: Date;
    }>,
  ) {
    const { disputeId, slaDeadline, violationTime } = job.data;

    try {
      await this.notificationService.sendBulkNotificationToManagers(
        'sla_violation',
        disputeId,
        { slaDeadline, violationTime },
      );

      this.logger.log(`SLA violation alerts sent for dispute ${disputeId}`);
    } catch (error) {
      this.logger.error(
        'Error sending SLA violation alert',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  @Process('approaching-sla')
  async handleApproachingSla(
    job: Job<{
      agentId: string;
      disputeId: string;
      slaDeadline: Date;
    }>,
  ) {
    const { agentId, disputeId, slaDeadline } = job.data;

    try {
      const hoursRemaining = Math.max(
        0,
        Math.round((slaDeadline.getTime() - Date.now()) / (1000 * 60 * 60)),
      );

      await this.notificationService.sendDisputeNotification({
        userId: agentId,
        disputeId,
        type: 'approaching_sla',
        hoursRemaining,
        slaDeadline,
      });

      this.logger.log(
        `Approaching SLA notification sent to agent ${agentId} for dispute ${disputeId}`,
      );
    } catch (error) {
      this.logger.error(
        'Error sending approaching SLA notification',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }
}
