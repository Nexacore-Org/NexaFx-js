import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';

export interface SmsNotification {
  to: string;
  message: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly twilioClient: twilio.Twilio | null = null;
  private readonly fromNumber: string;
  private readonly isEnabled: boolean;

  constructor(private configService: ConfigService) {
    this.isEnabled = this.configService.get('SMS_ENABLED', 'false') === 'true';
    this.fromNumber =
      this.configService.get<string>('TWILIO_PHONE_NUMBER') || '';

    if (this.isEnabled) {
      if (!this.fromNumber || this.fromNumber.trim() === '') {
        this.logger.error(
          'TWILIO_PHONE_NUMBER is required when SMS is enabled. Please set a valid sending number.',
        );
        throw new Error(
          'Initialization error: TWILIO_PHONE_NUMBER is required when SMS is enabled.',
        );
      }
      const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
      const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

      if (!accountSid || !authToken) {
        this.logger.warn(
          'TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not found. SMS notifications will be disabled.',
        );
        this.isEnabled = false;
      } else {
        this.twilioClient = twilio(accountSid, authToken);
        this.logger.log('Twilio SMS service initialized');
      }
    }
  }

  async sendSms(notification: SmsNotification): Promise<boolean> {
    if (!this.isEnabled || !this.twilioClient) {
      this.logger.log('SMS notifications disabled. Would send:', {
        to: notification.to,
        message: notification.message,
      });
      return true;
    }

    try {
      const message = await this.twilioClient.messages.create({
        body: notification.message,
        from: this.fromNumber,
        to: notification.to,
      });

      this.logger.log(
        `SMS sent successfully to ${notification.to}. SID: ${message.sid}`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${notification.to}:`, error);
      return false;
    }
  }

  // Predefined SMS templates for dispute notifications
  async sendDisputeCreatedSms(
    userPhone: string,
    disputeId: string,
  ): Promise<boolean> {
    const message = `NexaFx: Your dispute ${disputeId} has been created and is under review. We'll respond within 24 hours. Track progress in your dashboard.`;
    return this.sendSms({ to: userPhone, message });
  }

  async sendDisputeResolvedSms(
    userPhone: string,
    disputeId: string,
    outcome: string,
    refundAmount?: number,
  ): Promise<boolean> {
    let message = `NexaFx: Your dispute ${disputeId} has been resolved. Outcome: ${this.formatOutcome(outcome)}.`;

    if (refundAmount != null) {
      const formattedAmount = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        maximumFractionDigits: 2,
      }).format(refundAmount);
      message += ` Refund of ${formattedAmount} has been processed.`;
    }

    message += ' Thank you for using NexaFx.';

    return this.sendSms({ to: userPhone, message });
  }

  async sendDisputeAssignedSms(
    agentPhone: string,
    disputeId: string,
    priority: string,
  ): Promise<boolean> {
    const message = `NexaFx: New dispute ${disputeId} assigned to you. Priority: ${priority}. Please review immediately.`;
    return this.sendSms({ to: agentPhone, message });
  }

  async sendSlaViolationSms(
    managerPhone: string,
    disputeId: string,
  ): Promise<boolean> {
    const message = `NexaFx: URGENT - Dispute ${disputeId} has violated SLA deadline. Please escalate immediately.`;
    return this.sendSms({ to: managerPhone, message });
  }

  async sendApproachingSlaSms(
    agentPhone: string,
    disputeId: string,
    hoursRemaining: number,
  ): Promise<boolean> {
    const message = `NexaFx: Dispute ${disputeId} SLA deadline approaching. ${hoursRemaining} hours remaining. Please prioritize.`;
    return this.sendSms({ to: agentPhone, message });
  }

  private formatOutcome(outcome: string): string {
    const outcomeMap: Record<string, string> = {
      user_favor: 'Resolved in Your Favor',
      merchant_favor: 'Resolved in Merchant Favor',
      split: 'Split Decision',
    };
    return outcomeMap[outcome] || outcome;
  }

  // Validate phone number format (Nigerian numbers)
  isValidNigerianPhone(phone: string): boolean {
    // Remove any non-digit characters
    const cleaned = phone.replace(/\D/g, '');

    // Check if it's a valid Nigerian phone number
    // Nigerian numbers can start with +234, 234, or 0, followed by 10 digits
    const nigerianPattern = /^(\+?234|0)?[789][01]\d{8}$/;
    return nigerianPattern.test(cleaned);
  }

  // Format phone number to international format
  formatPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');

    if (cleaned.startsWith('234')) {
      return `+${cleaned}`;
    } else if (cleaned.startsWith('0')) {
      return `+234${cleaned.substring(1)}`;
    } else if (cleaned.length === 10) {
      return `+234${cleaned}`;
    }

    return phone; // Return as-is if we can't format it
  }
}
