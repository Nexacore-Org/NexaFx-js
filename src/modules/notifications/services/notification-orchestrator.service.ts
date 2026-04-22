import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationService } from './notification.service';
import { PushNotificationService } from './push-notification.service';
import { SmsService } from './sms.service';
import { NotificationPreferenceService, } from './notification-preference.service';
import { NotificationLogService } from './notification-log.service';
import { NotificationLogStatus } from '../entities/notification-log.entity';
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
    private readonly preferenceService: NotificationPreferenceService,
    private readonly notificationLogService: NotificationLogService,
    @InjectRepository(NotificationDeliveryReceiptEntity)
    private readonly receiptRepository: Repository<NotificationDeliveryReceiptEntity>,
  ) {}

  async notify(notification: OrchestratedNotification): Promise<void> {
    const { userId, type, title, body, data, urgency, payload, phoneNumber } = notification;

    // Generate a stable notification ID for receipt correlation
    const notificationId = `${type}:${userId}:${Date.now()}`;

    // Log the notification attempt (fire-and-forget)
    this.notificationLogService.logAsync({
      userId,
      notificationType: type,
      channel: 'multi_channel',
      status: NotificationLogStatus.SENT,
      payload: { title, body: body.substring(0, 200), urgency, channels: ['in_app', 'push', 'sms'] },
    });

    // 1. In-app / throttled channel
    const inAppEnabled = await this.preferenceService.isChannelEnabled(userId, type, DeliveryChannelPref.IN_APP);
    if (inAppEnabled) {
      try {
        await this.notificationService.send({
          type,
          userId,
          payload: { title, body, data, ...payload },
        });
        await this.persistReceipt(notificationId, userId, type, DeliveryChannel.IN_APP, DeliveryStatus.SUCCESS);
        
        // Log successful in-app delivery
        this.notificationLogService.logAsync({
          userId,
          notificationType: type,
          channel: DeliveryChannel.IN_APP,
          status: NotificationLogStatus.SENT,
          payload: { title, body: body.substring(0, 100) },
        });
      } catch (error: any) {
        await this.persistReceipt(notificationId, userId, type, DeliveryChannel.IN_APP, DeliveryStatus.FAILED, error.message);
        
        // Log failed in-app delivery
        this.notificationLogService.logAsync({
          userId,
          notificationType: type,
          channel: DeliveryChannel.IN_APP,
          status: NotificationLogStatus.FAILED,
          errorMessage: error.message,
          payload: { title, body: body.substring(0, 100) },
        });
      }
    } else {
      // Log throttled in-app notification
      this.notificationLogService.logAsync({
        userId,
        notificationType: type,
        channel: DeliveryChannel.IN_APP,
        status: NotificationLogStatus.THROTTLED,
        payload: { title, body: body.substring(0, 100) },
      });
    }

    // 2. Push channel (best-effort)
    let emailDelivered = true;
    const pushEnabled = await this.preferenceService.isChannelEnabled(userId, type, DeliveryChannelPref.PUSH);
    if (!pushEnabled) {
      emailDelivered = false;
      // Log disabled push channel
      this.notificationLogService.logAsync({
        userId,
        notificationType: type,
        channel: DeliveryChannel.PUSH,
        status: NotificationLogStatus.THROTTLED,
        payload: { title, body: body.substring(0, 100), reason: 'user_disabled' },
      });
    } else
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
          // Log failed push delivery
          this.notificationLogService.logAsync({
            userId,
            notificationType: type,
            channel: DeliveryChannel.PUSH,
            status: NotificationLogStatus.FAILED,
            errorMessage: r.error,
            payload: { title, body: body.substring(0, 100) },
          });
        }
      } else {
        for (const _r of results) {
          await this.persistReceipt(notificationId, userId, type, DeliveryChannel.PUSH, DeliveryStatus.SUCCESS);
          // Log successful push delivery
          this.notificationLogService.logAsync({
            userId,
            notificationType: type,
            channel: DeliveryChannel.PUSH,
            status: NotificationLogStatus.SENT,
            payload: { title, body: body.substring(0, 100) },
          });
        }
      }
    } catch (err: any) {
      emailDelivered = false;
      this.logger.error(`Push delivery error for user ${userId}: ${err?.message}`, err?.stack);
      await this.persistReceipt(notificationId, userId, type, DeliveryChannel.PUSH, DeliveryStatus.FAILED, err?.message);
      // Log push delivery error
      this.notificationLogService.logAsync({
        userId,
        notificationType: type,
        channel: DeliveryChannel.PUSH,
        status: NotificationLogStatus.FAILED,
        errorMessage: err.message,
        payload: { title, body: body.substring(0, 100) },
      });
    }

    // 3. SMS fallback - only for CRITICAL urgency with failed push delivery
    const smsEnabled = await this.preferenceService.isChannelEnabled(userId, type, DeliveryChannelPref.SMS);
    if (urgency === 'critical' && !emailDelivered && phoneNumber && smsEnabled) {
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

        // Log SMS delivery attempt
        this.notificationLogService.logAsync({
          userId,
          notificationType: type,
          channel: DeliveryChannel.SMS,
          status: smsResult.success ? NotificationLogStatus.SENT : NotificationLogStatus.FAILED,
          errorMessage: smsResult.error || null,
          payload: { title, body: body.substring(0, 100), fallback: true },
        });

        if (!smsResult.success) {
          this.logger.error(`SMS fallback failed for user ${userId}: ${smsResult.error}`);
        } else {
          this.logger.log(`SMS fallback delivered for critical notification to user ${userId}`);
        }
      } catch (err: any) {
        this.logger.error(`SMS fallback error for user ${userId}: ${err?.message}`, err?.stack);
        await this.persistReceipt(notificationId, userId, type, DeliveryChannel.SMS, DeliveryStatus.FAILED, err?.message);
        
        // Log SMS delivery error
        this.notificationLogService.logAsync({
          userId,
          notificationType: type,
          channel: DeliveryChannel.SMS,
          status: NotificationLogStatus.FAILED,
          errorMessage: err.message,
          payload: { title, body: body.substring(0, 100), fallback: true },
        });
      }
    } else if (urgency === 'critical' && !emailDelivered) {
      // Log why SMS was not sent
      const reason = !phoneNumber ? 'no_phone_number' : !smsEnabled ? 'sms_disabled' : 'not_critical';
      this.notificationLogService.logAsync({
        userId,
        notificationType: type,
        channel: DeliveryChannel.SMS,
        status: NotificationLogStatus.THROTTLED,
        payload: { title, body: body.substring(0, 100), fallback: true, reason },
      });
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
