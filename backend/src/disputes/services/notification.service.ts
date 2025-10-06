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
  assignedBy?: string;
  outcome?: string;
  refundAmount?: number;
  hoursRemaining?: number;
  slaDeadline?: Date;
  commentId?: string;
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

    const channelErrors: Array<{
      channel: 'email' | 'sms' | 'push';
      type: DisputeNotificationData['type'];
      userId: string;
      disputeId: string;
      error: unknown;
    }> = [];

    // Send notifications based on type and preferences
    switch (data.type) {
      case 'created':
        if (preferences.email) {
          try {
            results.emailSent = await this.emailService.sendDisputeCreatedEmail(
              user.email,
              user.name || 'User',
              data.disputeId,
              data.category || 'unknown',
            );
          } catch (error) {
            results.emailSent = false;
            this.logger.error(
              `Failed to send email notification [type=created, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'email',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        if (preferences.sms && user.phone) {
          try {
            results.smsSent = await this.smsService.sendDisputeCreatedSms(
              this.smsService.formatPhoneNumber(user.phone),
              data.disputeId,
            );
          } catch (error) {
            results.smsSent = false;
            this.logger.error(
              `Failed to send sms notification [type=created, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'sms',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        if (preferences.push && user.fcmToken) {
          try {
            results.pushSent =
              await this.pushNotificationService.sendDisputeCreatedPush(
                user.fcmToken,
                data.disputeId,
                data.category || 'unknown',
              );
          } catch (error) {
            results.pushSent = false;
            this.logger.error(
              `Failed to send push notification [type=created, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'push',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        break;

      case 'resolved':
        if (preferences.email) {
          try {
            results.emailSent =
              await this.emailService.sendDisputeResolvedEmail(
                user.email,
                user.name || 'User',
                data.disputeId,
                data.outcome || 'unknown',
                data.refundAmount,
              );
          } catch (error) {
            results.emailSent = false;
            this.logger.error(
              `Failed to send email notification [type=resolved, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'email',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        if (preferences.sms && user.phone) {
          try {
            results.smsSent = await this.smsService.sendDisputeResolvedSms(
              this.smsService.formatPhoneNumber(user.phone),
              data.disputeId,
              data.outcome || 'unknown',
              data.refundAmount,
            );
          } catch (error) {
            results.smsSent = false;
            this.logger.error(
              `Failed to send sms notification [type=resolved, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'sms',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        if (preferences.push && user.fcmToken) {
          try {
            results.pushSent =
              await this.pushNotificationService.sendDisputeResolvedPush(
                user.fcmToken,
                data.disputeId,
                data.outcome || 'unknown',
                data.refundAmount,
                {
                  // derive from user preferences if present; fallback to sensible defaults
                  locale:
                    (user.notificationPreferences &&
                      (user.notificationPreferences.locale as string)) ||
                    'en-NG',
                  currency:
                    (user.notificationPreferences &&
                      (user.notificationPreferences.currency as string)) ||
                    'NGN',
                },
              );
          } catch (error) {
            results.pushSent = false;
            this.logger.error(
              `Failed to send push notification [type=resolved, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'push',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        break;

      case 'assigned':
        // For agent assignments
        if (preferences.email) {
          try {
            results.emailSent =
              await this.emailService.sendDisputeAssignedEmail(
                user.email,
                user.name || 'Agent',
                data.disputeId,
                data.priority || 'medium',
              );
          } catch (error) {
            results.emailSent = false;
            this.logger.error(
              `Failed to send email notification [type=assigned, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'email',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        if (preferences.sms && user.phone) {
          try {
            results.smsSent = await this.smsService.sendDisputeAssignedSms(
              this.smsService.formatPhoneNumber(user.phone),
              data.disputeId,
              data.priority || 'medium',
            );
          } catch (error) {
            results.smsSent = false;
            this.logger.error(
              `Failed to send sms notification [type=assigned, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'sms',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        if (preferences.push && user.fcmToken) {
          try {
            results.pushSent =
              await this.pushNotificationService.sendDisputeAssignedPush(
                user.fcmToken,
                data.disputeId,
                data.priority || 'medium',
              );
          } catch (error) {
            results.pushSent = false;
            this.logger.error(
              `Failed to send push notification [type=assigned, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'push',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        break;

      case 'comment':
        // Handle comment notifications
        if (preferences.email) {
          try {
            results.emailSent = await this.emailService.sendDisputeCommentEmail(
              user.email,
              user.name || 'User',
              data.disputeId,
            );
          } catch (error) {
            results.emailSent = false;
            this.logger.error(
              `Failed to send email notification [type=comment, disputeId=${data.disputeId}, userId=${data.userId}${data.commentId ? `, commentId=${data.commentId}` : ''}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'email',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        if (preferences.push && user.fcmToken) {
          try {
            results.pushSent =
              await this.pushNotificationService.sendDisputeCommentPush(
                user.fcmToken,
                data.disputeId,
              );
          } catch (error) {
            results.pushSent = false;
            this.logger.error(
              `Failed to send push notification [type=comment, disputeId=${data.disputeId}, userId=${data.userId}${data.commentId ? `, commentId=${data.commentId}` : ''}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'push',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        break;

      case 'sla_violation':
        // For managers
        if (preferences.email) {
          try {
            results.emailSent = await this.emailService.sendSlaViolationEmail(
              user.email,
              user.name || 'Manager',
              data.disputeId,
              data.slaDeadline || new Date(),
            );
          } catch (error) {
            results.emailSent = false;
            this.logger.error(
              `Failed to send email notification [type=sla_violation, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'email',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        if (preferences.sms && user.phone) {
          try {
            results.smsSent = await this.smsService.sendSlaViolationSms(
              this.smsService.formatPhoneNumber(user.phone),
              data.disputeId,
            );
          } catch (error) {
            results.smsSent = false;
            this.logger.error(
              `Failed to send sms notification [type=sla_violation, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'sms',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        if (preferences.push && user.fcmToken) {
          try {
            results.pushSent = await this.pushNotificationService
              .sendSlaViolationPush([user.fcmToken], data.disputeId)
              .then((result) => result.successCount > 0);
          } catch (error) {
            results.pushSent = false;
            this.logger.error(
              `Failed to send push notification [type=sla_violation, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'push',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        break;

      case 'approaching_sla':
        if (preferences.sms && user.phone) {
          try {
            results.smsSent = await this.smsService.sendApproachingSlaSms(
              this.smsService.formatPhoneNumber(user.phone),
              data.disputeId,
              data.hoursRemaining || 0,
            );
          } catch (error) {
            results.smsSent = false;
            this.logger.error(
              `Failed to send sms notification [type=approaching_sla, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'sms',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        if (preferences.push && user.fcmToken) {
          try {
            results.pushSent =
              await this.pushNotificationService.sendApproachingSlaPush(
                user.fcmToken,
                data.disputeId,
                data.hoursRemaining || 0,
              );
          } catch (error) {
            results.pushSent = false;
            this.logger.error(
              `Failed to send push notification [type=approaching_sla, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'push',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        break;

      case 'escalated':
        // Handle escalation notifications
        if (preferences.email) {
          try {
            results.emailSent =
              await this.emailService.sendDisputeEscalatedEmail(
                user.email,
                user.name || 'Manager',
                data.disputeId,
              );
          } catch (error) {
            results.emailSent = false;
            this.logger.error(
              `Failed to send email notification [type=escalated, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'email',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        if (preferences.push && user.fcmToken) {
          try {
            results.pushSent =
              await this.pushNotificationService.sendDisputeEscalatedPush(
                user.fcmToken,
                data.disputeId,
              );
          } catch (error) {
            results.pushSent = false;
            this.logger.error(
              `Failed to send push notification [type=escalated, disputeId=${data.disputeId}, userId=${data.userId}]`,
              error instanceof Error ? error.stack : JSON.stringify(error),
            );
            channelErrors.push({
              channel: 'push',
              type: data.type,
              userId: data.userId,
              disputeId: data.disputeId,
              error,
            });
          }
        }
        break;

      default:
        this.logger.warn(`Unhandled notification type: ${data.type as string}`);
        break;
    }

    if (channelErrors.length > 0) {
      this.logger.error(
        `One or more channels failed for dispute notification [type=${data.type as string}, disputeId=${data.disputeId}, userId=${data.userId}]`,
        JSON.stringify(
          channelErrors.map((e) => ({
            channel: e.channel,
            type: e.type,
            userId: e.userId,
            disputeId: e.disputeId,
            // Avoid logging full error objects twice; include message if available
            error: e.error instanceof Error ? e.error.message : String(e.error),
          })),
        ),
      );
    }

    this.logger.log(`Dispute notification sent for ${data.type as string}:`, {
      disputeId: data.disputeId,
      userId: data.userId,
      results,
    });

    return results;
  }

  async sendBulkNotificationToManagers(
    notificationType: 'sla_violation' | 'escalated',
    disputeId: string,
    additionalData?: Record<string, unknown>,
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
      let managerSuccess = false;

      if (notificationType === 'sla_violation') {
        const results = await this.sendDisputeNotification({
          userId: manager.id,
          disputeId,
          type: 'sla_violation',
          slaDeadline: (additionalData as { slaDeadline?: Date })?.slaDeadline,
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
        const prefs = user.notificationPreferences;

        return {
          email: (prefs.email as boolean) ?? this.defaultPreferences.email,
          sms: (prefs.sms as boolean) ?? this.defaultPreferences.sms,
          push: (prefs.push as boolean) ?? this.defaultPreferences.push,
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

  // Update user notification preferences atomically using JSONB merge
  async updateUserNotificationPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>,
  ): Promise<boolean> {
    try {
      // Perform atomic JSONB merge update at database level
      // This eliminates race conditions by doing the merge in PostgreSQL
      const result = await this.userRepository
        .createQueryBuilder()
        .update(User)
        .set({
          notificationPreferences: () => `
            COALESCE(
              notification_preferences || :newPreferences,
              :defaultPreferences
            )
          `,
          updatedAt: () => 'NOW()',
        })
        .where('id = :userId', { userId })
        .setParameters({
          newPreferences: JSON.stringify(preferences),
          defaultPreferences: JSON.stringify(this.defaultPreferences),
        })
        .execute();

      const affectedRows = result.affected || 0;

      if (affectedRows === 0) {
        this.logger.warn(
          `No user found with ID ${userId} for notification preferences update`,
        );
        return false;
      }

      this.logger.log(
        `Atomically updated notification preferences for user ${userId}:`,
        {
          preferences,
          affectedRows,
        },
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to atomically update notification preferences for user ${userId}:`,
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
      select: ['id', 'email', 'phone', 'fcmToken', 'name'],
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
