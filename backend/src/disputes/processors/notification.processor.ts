import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '../services/notification.service';

@Injectable()
@Processor('notification')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private notificationService: NotificationService) {}

  // Runtime validation helpers
  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private toValidDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  @Process('dispute-created')
  async handleDisputeCreated(
    job: Job<{ userId: string; disputeId: string; category: string }>,
  ) {
    const { userId, disputeId, category } = job.data ?? ({} as any);

    if (
      !this.isNonEmptyString(userId) ||
      !this.isNonEmptyString(disputeId) ||
      !this.isNonEmptyString(category)
    ) {
      const message =
        'Invalid dispute-created payload: userId, disputeId, category';
      this.logger.error(message, JSON.stringify(job.data));
      throw new Error(message);
    }

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
    const { agentId, disputeId, assignedBy, priority } =
      job.data ?? ({} as any);

    if (!this.isNonEmptyString(agentId) || !this.isNonEmptyString(disputeId)) {
      const message = 'Invalid dispute-assigned payload: agentId and disputeId';
      this.logger.error(message, JSON.stringify(job.data));
      throw new Error(message);
    }
    if (
      !this.isOptionalString(assignedBy) ||
      !this.isOptionalString(priority)
    ) {
      const message =
        'Invalid dispute-assigned payload: assignedBy/priority types';
      this.logger.error(message, JSON.stringify(job.data));
      throw new Error(message);
    }

    try {
      await this.notificationService.sendDisputeNotification({
        userId: agentId,
        disputeId,
        type: 'assigned',
        assignedBy,
        priority,
      });

      this.logger.log(
        `Dispute assignment notification sent to agent ${agentId} for dispute ${disputeId}${assignedBy ? ` (assigned by ${assignedBy})` : ''}`,
      );
    } catch (error) {
      this.logger.error(
        'Error sending dispute assignment notification',
        error instanceof Error ? error.stack : String(error),
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
    const { userId, disputeId, outcome, refundAmount } =
      job.data ?? ({} as any);

    if (
      !this.isNonEmptyString(userId) ||
      !this.isNonEmptyString(disputeId) ||
      !this.isNonEmptyString(outcome)
    ) {
      const message =
        'Invalid dispute-resolved payload: userId, disputeId, outcome';
      this.logger.error(message, JSON.stringify(job.data));
      throw new Error(message);
    }
    if (!(refundAmount === undefined || this.isFiniteNumber(refundAmount))) {
      const message = 'Invalid dispute-resolved payload: refundAmount type';
      this.logger.error(message, JSON.stringify(job.data));
      throw new Error(message);
    }

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
    const { userId, disputeId, commentId } = job.data ?? ({} as any);

    if (
      !this.isNonEmptyString(userId) ||
      !this.isNonEmptyString(disputeId) ||
      !this.isNonEmptyString(commentId)
    ) {
      const message =
        'Invalid dispute-comment payload: userId, disputeId, commentId';
      this.logger.error(message, JSON.stringify(job.data));
      throw new Error(message);
    }

    try {
      await this.notificationService.sendDisputeNotification({
        userId,
        disputeId,
        type: 'comment',
        commentId,
      });

      this.logger.log(
        `Dispute comment notification sent to user ${userId} for dispute ${disputeId} (commentId: ${commentId})`,
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
    const { disputeId, reason, escalationLevel } = job.data ?? ({} as any);

    if (!this.isNonEmptyString(disputeId) || !this.isNonEmptyString(reason)) {
      const message = 'Invalid dispute-escalated payload: disputeId and reason';
      this.logger.error(message, JSON.stringify(job.data));
      throw new Error(message);
    }
    if (!this.isFiniteNumber(escalationLevel)) {
      const message = 'Invalid dispute-escalated payload: escalationLevel type';
      this.logger.error(message, JSON.stringify(job.data));
      throw new Error(message);
    }

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
    const { disputeId } = job.data ?? ({} as any);
    const slaDeadline = this.toValidDate(job.data?.slaDeadline);
    const violationTime = this.toValidDate(job.data?.violationTime);

    if (!this.isNonEmptyString(disputeId)) {
      const message = 'Invalid sla-violation-alert payload: disputeId';
      this.logger.error(message, JSON.stringify(job.data));
      throw new Error(message);
    }
    if (!slaDeadline || !violationTime) {
      const message =
        'Invalid sla-violation-alert payload: slaDeadline/violationTime dates';
      this.logger.error(message, JSON.stringify(job.data));
      throw new Error(message);
    }

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
      slaDeadline: string | Date;
    }>,
  ) {
    const { agentId, disputeId } = job.data ?? ({} as any);
    const slaDeadlineRaw = job.data?.slaDeadline;
    // Bull serializes Date objects to strings; deserialize before use
    const slaDeadline = this.toValidDate(slaDeadlineRaw);

    if (!this.isNonEmptyString(agentId) || !this.isNonEmptyString(disputeId)) {
      const message = 'Invalid approaching-sla payload: agentId and disputeId';
      this.logger.error(message, JSON.stringify(job.data));
      throw new Error(message);
    }
    if (!slaDeadline) {
      const message = 'Invalid approaching-sla payload: slaDeadline date';
      this.logger.error(message, JSON.stringify(job.data));
      throw new Error(message);
    }

    try {
      const msRemaining = slaDeadline.getTime() - Date.now();

      // If the SLA deadline has already passed, skip sending the approaching notification
      if (msRemaining <= 0) {
        this.logger.log(
          `Skipping approaching SLA notification for dispute ${disputeId} (agent ${agentId}) because deadline has passed`,
        );
        return;
      }

      const hoursRemaining = Math.round(msRemaining / (1000 * 60 * 60));

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
