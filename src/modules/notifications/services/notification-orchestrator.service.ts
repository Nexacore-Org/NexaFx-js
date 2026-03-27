import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationService } from './notification.service';
import { PushNotificationService } from './push-notification.service';
import { SmsService } from './sms.service';
import {
  NotificationDeliveryReceiptEntity,
  DeliveryChannel,
  DeliveryStatus,
} from '../entities/notification-delivery-receipt.entity';

export interface OrchestratedNotification {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  urgency?: 'normal' | 'high' | 'critical';
  payload?: Record<string, any>;
  /** Phone number to SMS if email fails and urgency is critical */
  phoneNumber?: string;
}

/**
 * NotificationOrchestratorService fans out a notification across all
 * delivery channels: in-app (throttled), push (FCM/APNs), and SMS (on CRITICAL fallback).
 * A delivery receipt is persisted per channel per notification.
 */
@Injectable()
export class NotificationOrchestratorService {
  private readonly logger = new Logger(NotificationOrchestratorService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushService: PushNotificationService,
    private readonly smsService: SmsService,
    @InjectRepository(NotificationDeliveryReceiptEntity)
    private readonly receiptRepository: Repository<NotificationDeliveryReceiptEntity>,
  ) {}

  async notify(notification: OrchestratedNotification): Promise<void> {
    const { userId, type, title, body, data, urgency, payload, phoneNumber } = notification;

    // Generate a stable notification ID for receipt correlation
    const notificationId = `${type}:${userId}:${Date.now()}`;

    // 1. In-app / throttled channel
    await this.notificationService.send({
      type,
      userId,
      payload: { title, body, data, ...payload },
    });
    await this.persistReceipt(notificationId, userId, type, DeliveryChannel.IN_APP, DeliveryStatus.SUCCESS);

    // 2. Push channel (best-effort)
    let emailDelivered = true;
    try {
      const results = await this.pushService.sendToUser(userId, {
        title,
        body,
        data,
        urgency: urgency === 'critical' ? 'high' : urgency,
      });

      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        emailDelivered = false;
        this.logger.warn(
          `Push delivery partial failure for user ${userId}: ${failed.map((r) => r.error).join(', ')}`,
        );
        for (const r of failed) {
          await this.persistReceipt(notificationId, userId, type, DeliveryChannel.PUSH, DeliveryStatus.FAILED, r.error);
        }
      } else {
        for (const _r of results) {
          await this.persistReceipt(notificationId, userId, type, DeliveryChannel.PUSH, DeliveryStatus.SUCCESS);
        }
      }
    } catch (err: any) {
      emailDelivered = false;
      this.logger.error(`Push delivery error for user ${userId}: ${err?.message}`, err?.stack);
      await this.persistReceipt(notificationId, userId, type, DeliveryChannel.PUSH, DeliveryStatus.FAILED, err?.message);
    }

    // 3. SMS fallback — only for CRITICAL urgency with failed push delivery
    if (urgency === 'critical' && !emailDelivered && phoneNumber) {
      try {
        const smsResult = await this.smsService.send({
          to: phoneNumber,
          body: `${title}: ${body}`,
        });

        await this.persistReceipt(
          notificationId,
          userId,
          type,
          DeliveryChannel.SMS,
          smsResult.success ? DeliveryStatus.SUCCESS : DeliveryStatus.FAILED,
          smsResult.error ?? null,
          smsResult.messageId,
        );

        if (!smsResult.success) {
          this.logger.error(`SMS fallback failed for user ${userId}: ${smsResult.error}`);
        } else {
          this.logger.log(`SMS fallback delivered for critical notification to user ${userId}`);
        }
      } catch (err: any) {
        this.logger.error(`SMS fallback error for user ${userId}: ${err?.message}`, err?.stack);
        await this.persistReceipt(notificationId, userId, type, DeliveryChannel.SMS, DeliveryStatus.FAILED, err?.message);
      }
    }
  }

  private persistReceipt(
    notificationId: string,
    userId: string,
    notificationType: string,
    channel: DeliveryChannel,
    status: DeliveryStatus,
    errorDetail?: string | null,
    providerMessageId?: string,
  ): Promise<NotificationDeliveryReceiptEntity> {
    return this.receiptRepository.save(
      this.receiptRepository.create({
        notificationId,
        userId,
        notificationType,
        channel,
        status,
        errorDetail: errorDetail ?? null,
        providerMessageId: providerMessageId ?? null,
        attemptedAt: new Date(),
      }),
    );
  }
}
