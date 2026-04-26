import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../../notifications/services/notification.service';

export enum TransactionNotificationType {
  TRANSACTION_COMPLETED = 'TRANSACTION_COMPLETED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  TRANSACTION_PENDING_APPROVAL = 'TRANSACTION_PENDING_APPROVAL',
  HIGH_RISK_TRANSACTION_FLAGGED = 'HIGH_RISK_TRANSACTION_FLAGGED',
}

@Injectable()
export class TransactionNotificationListener {
  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent('transaction.completed')
  async handleCompleted(payload: any) {
    setImmediate(async () => {
      await this.notificationService.send({
        type: TransactionNotificationType.TRANSACTION_COMPLETED,
        recipients: [payload.senderId, payload.recipientId],
        data: payload,
      });
    });
  }

  @OnEvent('transaction.failed')
  async handleFailed(payload: any) {
    setImmediate(async () => {
      await this.notificationService.send({
        type: TransactionNotificationType.TRANSACTION_FAILED,
        recipients: [payload.senderId],
        data: payload,
      });
    });
  }

  @OnEvent('transaction.pending_approval')
  async handlePendingApproval(payload: any) {
    setImmediate(async () => {
      await this.notificationService.send({
        type: TransactionNotificationType.TRANSACTION_PENDING_APPROVAL,
        recipients: payload.approvers || [],
        data: payload,
      });
    });
  }

  @OnEvent('transaction.high_risk_flagged')
  async handleHighRisk(payload: any) {
    setImmediate(async () => {
      await this.notificationService.send({
        type: TransactionNotificationType.HIGH_RISK_TRANSACTION_FLAGGED,
        recipients: ['compliance'],
        data: payload,
      });
    });
  }
}