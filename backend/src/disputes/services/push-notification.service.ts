import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface PushNotification {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
}

export interface MultiDeviceNotification {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly isEnabled: boolean;

  constructor(private configService: ConfigService) {
    this.isEnabled = this.configService.get('PUSH_ENABLED', 'false') === 'true';

    if (this.isEnabled) {
      const serviceAccountPath = this.configService.get<string>(
        'FIREBASE_SERVICE_ACCOUNT_PATH',
      );
      const serviceAccountKey = this.configService.get<string>(
        'FIREBASE_SERVICE_ACCOUNT_KEY',
      );

      if (serviceAccountPath) {
        // Initialize with service account file
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccountPath),
        });
        this.logger.log(
          'Firebase Admin SDK initialized with service account file',
        );
      } else if (serviceAccountKey) {
        // Initialize with service account key object
        const serviceAccount = JSON.parse(
          serviceAccountKey,
        ) as admin.ServiceAccount;
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.logger.log(
          'Firebase Admin SDK initialized with service account key',
        );
      } else {
        this.logger.warn(
          'Firebase credentials not found. Push notifications will be disabled.',
        );
        this.isEnabled = false;
      }
    }
  }

  async sendPushNotification(notification: PushNotification): Promise<boolean> {
    if (!this.isEnabled) {
      this.logger.log('Push notifications disabled. Would send:', notification);
      return true;
    }

    try {
      const message: admin.messaging.Message = {
        token: notification.token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data || {},
        apns: {
          payload: {
            aps: {
              badge: notification.badge,
              sound: 'default',
            },
          },
        },
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#007bff',
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(
        `Push notification sent successfully. Message ID: ${response}`,
      );
      return true;
    } catch (error) {
      this.logger.error('Failed to send push notification:', error);
      return false;
    }
  }

  async sendMultiDeviceNotification(
    notification: MultiDeviceNotification,
  ): Promise<{
    successCount: number;
    failureCount: number;
    failedTokens: string[];
  }> {
    if (!this.isEnabled) {
      this.logger.log(
        'Push notifications disabled. Would send to multiple devices:',
        {
          tokenCount: notification.tokens.length,
          title: notification.title,
        },
      );
      return {
        successCount: notification.tokens.length,
        failureCount: 0,
        failedTokens: [],
      };
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens: notification.tokens,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data || {},
        apns: {
          payload: {
            aps: {
              badge: notification.badge,
              sound: 'default',
            },
          },
        },
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#007bff',
          },
        },
      };

      const response = await admin.messaging().sendMulticast(message);

      this.logger.log(
        `Multicast push notification sent. Success: ${response.successCount}, Failure: ${response.failureCount}`,
      );

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        failedTokens: response.responses
          .map((resp, index) => ({ resp, token: notification.tokens[index] }))
          .filter(({ resp }) => !resp.success)
          .map(({ token }) => token),
      };
    } catch (error) {
      this.logger.error('Failed to send multicast push notification:', error);
      return {
        successCount: 0,
        failureCount: notification.tokens.length,
        failedTokens: notification.tokens,
      };
    }
  }

  // Predefined push notification templates for dispute notifications
  async sendDisputeCreatedPush(
    userToken: string,
    disputeId: string,
    category: string,
  ): Promise<boolean> {
    return this.sendPushNotification({
      token: userToken,
      title: 'Dispute Created',
      body: `Your ${this.formatCategory(category)} dispute has been submitted for review`,
      data: {
        type: 'dispute_created',
        disputeId,
        category,
        action: 'view_dispute',
      },
    });
  }

  async sendDisputeResolvedPush(
    userToken: string,
    disputeId: string,
    outcome: string,
    refundAmount?: number,
  ): Promise<boolean> {
    let body = `Your dispute has been resolved: ${this.formatOutcome(outcome)}`;
    if (refundAmount) {
      body += `. Refund of ₦${refundAmount.toLocaleString()} processed.`;
    }

    return this.sendPushNotification({
      token: userToken,
      title: 'Dispute Resolved',
      body,
      data: {
        type: 'dispute_resolved',
        disputeId,
        outcome,
        refundAmount: refundAmount?.toString() || '0',
        action: 'view_dispute',
      },
    });
  }

  async sendDisputeAssignedPush(
    agentToken: string,
    disputeId: string,
    priority: string,
  ): Promise<boolean> {
    return this.sendPushNotification({
      token: agentToken,
      title: 'New Dispute Assignment',
      body: `Priority ${priority} dispute assigned to you`,
      data: {
        type: 'dispute_assigned',
        disputeId,
        priority,
        action: 'view_dispute',
      },
      badge: 1, // Increment badge count
    });
  }

  async sendDisputeCommentPush(
    userToken: string,
    disputeId: string,
  ): Promise<boolean> {
    return this.sendPushNotification({
      token: userToken,
      title: 'New Comment on Dispute',
      body: `A new comment was added to dispute ${disputeId}`,
      data: {
        type: 'dispute_comment',
        disputeId,
        action: 'view_dispute',
      },
      badge: 1,
    });
  }

  async sendDisputeEscalatedPush(
    userToken: string,
    disputeId: string,
  ): Promise<boolean> {
    return this.sendPushNotification({
      token: userToken,
      title: 'Dispute Escalated',
      body: `Your dispute ${disputeId} has been escalated`,
      data: {
        type: 'dispute_escalated',
        disputeId,
        action: 'view_dispute',
      },
      badge: 1,
    });
  }

  async sendSlaViolationPush(
    managerTokens: string[],
    disputeId: string,
  ): Promise<{
    successCount: number;
    failureCount: number;
    failedTokens: string[];
  }> {
    return this.sendMultiDeviceNotification({
      tokens: managerTokens,
      title: 'SLA Violation Alert',
      body: `Dispute ${disputeId} has exceeded SLA deadline`,
      data: {
        type: 'sla_violation',
        disputeId,
        action: 'view_dispute',
      },
      badge: 1,
    });
  }

  async sendApproachingSlaPush(
    agentToken: string,
    disputeId: string,
    hoursRemaining: number,
  ): Promise<boolean> {
    return this.sendPushNotification({
      token: agentToken,
      title: 'SLA Deadline Approaching',
      body: `${hoursRemaining} hours remaining for dispute ${disputeId}`,
      data: {
        type: 'approaching_sla',
        disputeId,
        hoursRemaining: hoursRemaining.toString(),
        action: 'view_dispute',
      },
    });
  }

  // Validate FCM token format
  isValidFcmToken(token: string): boolean {
    if (typeof token !== 'string') {
      return false;
    }
    // FCM tokens are typically long and contain alphanumeric characters and some special chars
    return token.length >= 140 && /^[a-zA-Z0-9_-]+$/.test(token);
  }

  private formatCategory(category: string): string {
    const categoryMap: Record<string, string> = {
      unauthorized_transaction: 'Unauthorized Transaction',
      transaction_failed: 'Transaction Failed',
      wrong_amount: 'Wrong Amount',
      duplicate_charge: 'Duplicate Charge',
      service_not_received: 'Service Not Received',
      technical_error: 'Technical Error',
      fraud_suspected: 'Fraud Suspected',
      other: 'Other',
    };
    return categoryMap[category] || category;
  }

  private formatOutcome(outcome: string): string {
    const outcomeMap: Record<string, string> = {
      user_favor: 'Resolved in Your Favor',
      merchant_favor: 'Resolved in Merchant Favor',
      split: 'Split Decision',
    };
    return outcomeMap[outcome] || outcome;
  }
}
