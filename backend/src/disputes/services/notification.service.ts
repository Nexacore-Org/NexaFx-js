import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { PushNotificationService } from './push-notification.service';
import { ConfigService } from '@nestjs/config';

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
}

export interface DisputeNotificationData {
  userId: string;
  disputeId: string;
  type:
    | 'created'
    | 'assigned'
    | 'resolved'
    | 'comment'
    | 'escalated'
    | 'sla_violation'
    | 'approaching_sla';
  priority?: string;
  category?: string;
  outcome?: string;
  refundAmount?: number;
  hoursRemaining?: number;
  slaDeadline?: Date;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly defaultPreferences: NotificationPreferences = {
    email: true,
    sms: false, // Default to false for SMS to avoid charges
    push: true,
  };

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private emailService: EmailService,
    private smsService: SmsService,
    private pushNotificationService: PushNotificationService,
    private configService: ConfigService,
  ) {}

  async sendDisputeNotification(data: DisputeNotificationData): Promise<{
    emailSent: boolean;
    smsSent: boolean;
    pushSent: boolean;
  }> {
    const user = await this.userRepository.findOne({
      where: { id: data.userId },
      select: [
        'id',
        'email',
        'phone',
        'fcmToken',
        'notificationPreferences',
        'name',
      ],
    });

    if (!user) {
      this.logger.warn(`User ${data.userId} not found for notification`);
      return { emailSent: false, smsSent: false, pushSent: false };
    }

    // Get user notification preferences
    const preferences = this.getUserNotificationPreferences(user);

    const results = {
      emailSent: false,
      smsSent: false,
      pushSent: false,
    };

    // Send notifications based on type and preferences
    switch (data.type) {
      case 'created':
        if (preferences.email) {
          results.emailSent = await this.emailService.sendDisputeCreatedEmail(
            user.email,
            user.name || 'User',
            data.disputeId,
            data.category || 'unknown',
          );
        }
        if (preferences.sms && user.phone) {
          results.smsSent = await this.smsService.sendDisputeCreatedSms(
            this.smsService.formatPhoneNumber(user.phone),
            data.disputeId,
          );
        }
        if (preferences.push && user.fcmToken) {
          results.pushSent =
            await this.pushNotificationService.sendDisputeCreatedPush(
              user.fcmToken,
              data.disputeId,
              data.category || 'unknown',
            );
        }
        break;

      case 'resolved':
        if (preferences.email) {
          results.emailSent = await this.emailService.sendDisputeResolvedEmail(
            user.email,
            user.name || 'User',
            data.disputeId,
            data.outcome || 'unknown',
            data.refundAmount,
          );
        }
        if (preferences.sms && user.phone) {
          results.smsSent = await this.smsService.sendDisputeResolvedSms(
            this.smsService.formatPhoneNumber(user.phone),
            data.disputeId,
            data.outcome || 'unknown',
            data.refundAmount,
          );
        }
        if (preferences.push && user.fcmToken) {
          results.pushSent =
            await this.pushNotificationService.sendDisputeResolvedPush(
              user.fcmToken,
              data.disputeId,
              data.outcome || 'unknown',
              data.refundAmount,
            );
        }
        break;

      case 'assigned':
        // For agent assignments
        if (preferences.email) {
          results.emailSent = await this.emailService.sendDisputeAssignedEmail(
            user.email,
            user.name || 'Agent',
            data.disputeId,
            data.priority || 'medium',
          );
        }
        if (preferences.sms && user.phone) {
          results.smsSent = await this.smsService.sendDisputeAssignedSms(
            this.smsService.formatPhoneNumber(user.phone),
            data.disputeId,
            data.priority || 'medium',
          );
        }
        if (preferences.push && user.fcmToken) {
          results.pushSent =
            await this.pushNotificationService.sendDisputeAssignedPush(
              user.fcmToken,
              data.disputeId,
              data.priority || 'medium',
            );
        }
        break;

      case 'comment':
        // Handle comment notifications
        if (preferences.email) {
          results.emailSent = await this.emailService.sendDisputeCommentEmail(
            user.email,
            user.name || 'User',
            data.disputeId,
          );
        }
        if (preferences.push && user.fcmToken) {
          results.pushSent =
            await this.pushNotificationService.sendDisputeCommentPush(
              user.fcmToken,
              data.disputeId,
            );
        }
        break;

      case 'sla_violation':
        // For managers
        if (preferences.email) {
          results.emailSent = await this.emailService.sendSlaViolationEmail(
            user.email,
            user.name || 'Manager',
            data.disputeId,
            data.slaDeadline || new Date(),
          );
        }
        if (preferences.sms && user.phone) {
          results.smsSent = await this.smsService.sendSlaViolationSms(
            this.smsService.formatPhoneNumber(user.phone),
            data.disputeId,
          );
        }
        if (preferences.push && user.fcmToken) {
          results.pushSent = await this.pushNotificationService
            .sendSlaViolationPush([user.fcmToken], data.disputeId)
            .then((result) => result.successCount > 0);
        }
        break;

      case 'approaching_sla':
        if (preferences.sms && user.phone) {
          results.smsSent = await this.smsService.sendApproachingSlaSms(
            this.smsService.formatPhoneNumber(user.phone),
            data.disputeId,
            data.hoursRemaining || 0,
          );
        }
        if (preferences.push && user.fcmToken) {
          results.pushSent =
            await this.pushNotificationService.sendApproachingSlaPush(
              user.fcmToken,
              data.disputeId,
              data.hoursRemaining || 0,
            );
        }
        break;

      case 'escalated':
        // Handle escalation notifications
        if (preferences.email) {
          results.emailSent = await this.emailService.sendDisputeEscalatedEmail(
            user.email,
            user.name || 'Manager',
            data.disputeId,
          );
        }
        if (preferences.push && user.fcmToken) {
          results.pushSent =
            await this.pushNotificationService.sendDisputeEscalatedPush(
              user.fcmToken,
              data.disputeId,
            );
        }
        break;

      default:
        this.logger.warn(`Unhandled notification type: ${data.type}`);
        break;
    }

    this.logger.log(`Dispute notification sent for ${data.type}:`, {
      disputeId: data.disputeId,
      userId: data.userId,
      results,
    });

    return results;
  }

  async sendBulkNotificationToManagers(
    notificationType: 'sla_violation' | 'escalated',
    disputeId: string,
    additionalData?: any,
  ): Promise<{ successCount: number; totalCount: number }> {
    // Get all managers (L2 and L3 agents)
    const managers = await this.userRepository.find({
      where: [
        { isAgent: true, agentLevel: 'L2' },
        { isAgent: true, agentLevel: 'L3' },
      ],
      select: [
        'id',
        'email',
        'phone',
        'fcmToken',
        'notificationPreferences',
        'name',
      ],
    });

    let successCount = 0;
    const totalCount = managers.length;

    for (const manager of managers) {
      const preferences = this.getUserNotificationPreferences(manager);
      let managerSuccess = false;

      if (notificationType === 'sla_violation') {
        const results = await this.sendDisputeNotification({
          userId: manager.id,
          disputeId,
          type: 'sla_violation',
          slaDeadline: additionalData?.slaDeadline,
        });
        managerSuccess =
          results.emailSent || results.smsSent || results.pushSent;
      }

      if (managerSuccess) {
        successCount++;
      }
    }

    this.logger.log(`Bulk notification sent to managers:`, {
      type: notificationType,
      disputeId,
      successCount,
      totalCount,
    });

    return { successCount, totalCount };
  }

  private getUserNotificationPreferences(user: User): NotificationPreferences {
    if (user.notificationPreferences) {
      try {
        const prefs =
          typeof user.notificationPreferences === 'string'
            ? JSON.parse(user.notificationPreferences)
            : user.notificationPreferences;

        return {
          email: prefs.email ?? this.defaultPreferences.email,
          sms: prefs.sms ?? this.defaultPreferences.sms,
          push: prefs.push ?? this.defaultPreferences.push,
        };
      } catch (error) {
        this.logger.warn(
          `Invalid notification preferences for user ${user.id}:`,
          error,
        );
      }
    }

    return this.defaultPreferences;
  }

  // Update user notification preferences
  async updateUserNotificationPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>,
  ): Promise<boolean> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        return false;
      }

      const currentPrefs = this.getUserNotificationPreferences(user);
      const newPrefs = { ...currentPrefs, ...preferences };

      user.notificationPreferences = JSON.stringify(newPrefs);
      await this.userRepository.save(user);

      this.logger.log(
        `Updated notification preferences for user ${userId}:`,
        newPrefs,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to update notification preferences for user ${userId}:`,
        error,
      );
      return false;
    }
  }

  // Test notification delivery
  async testNotificationDelivery(
    userId: string,
    type: 'email' | 'sms' | 'push',
  ): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'phone', 'fcmToken'],
    });

    if (!user) {
      return false;
    }

    const testMessage =
      'This is a test notification from NexaFx dispute system.';

    switch (type) {
      case 'email':
        return await this.emailService.sendEmail({
          to: user.email,
          subject: 'Test Notification - NexaFx',
          html: `<p>${testMessage}</p>`,
          text: testMessage,
        });

      case 'sms':
        if (!user.phone) return false;
        return await this.smsService.sendSms({
          to: this.smsService.formatPhoneNumber(user.phone),
          message: testMessage,
        });

      case 'push':
        if (!user.fcmToken) return false;
        return await this.pushNotificationService.sendPushNotification({
          token: user.fcmToken,
          title: 'Test Notification',
          body: testMessage,
          data: { type: 'test' },
        });

      default:
        return false;
    }
  }
}
