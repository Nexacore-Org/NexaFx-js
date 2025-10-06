import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

export interface EmailTemplate {
  templateId: string;
  data: Record<string, any>;
}

export interface EmailNotification {
  to: string;
  subject: string;
  template?: EmailTemplate;
  html?: string;
  text?: string;
}

interface SendGridMessage {
  to: string;
  from: string;
  subject: string;
  templateId?: string;
  dynamicTemplateData?: Record<string, any>;
  html?: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail: string;
  private readonly isEnabled: boolean;

  // Escape HTML special characters to prevent XSS in email templates
  private escapeHtml(unsafe: string): string {
    if (unsafe === undefined || unsafe === null) {
      return '';
    }
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  constructor(private configService: ConfigService) {
    this.isEnabled = this.configService.get('EMAIL_ENABLED', 'true') === 'true';
    this.fromEmail = this.configService.get(
      'SENDGRID_FROM_EMAIL',
      'noreply@nexafx.com',
    );

    if (this.isEnabled) {
      const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
      if (!apiKey) {
        this.logger.warn(
          'SENDGRID_API_KEY not found. Email notifications will be disabled.',
        );
        this.isEnabled = false;
      } else {
        sgMail.setApiKey(apiKey);
        this.logger.log('SendGrid email service initialized');
      }
    }
  }

  async sendEmail(notification: EmailNotification): Promise<boolean> {
    if (!this.isEnabled) {
      this.logger.log('Email notifications disabled. Would send:', {
        to: notification.to,
        subject: notification.subject,
      });
      return true;
    }

    try {
      const msg: SendGridMessage = {
        to: notification.to,
        from: this.fromEmail,
        subject: notification.subject,
      };

      if (notification.template) {
        msg.templateId = notification.template.templateId;
        msg.dynamicTemplateData = notification.template.data;
      } else {
        msg.html = notification.html;
        msg.text = notification.text;
      }

      await sgMail.send(msg as any);
      this.logger.log(`Email sent successfully to ${notification.to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${notification.to}:`, error);
      return false;
    }
  }

  // Predefined email templates for dispute notifications
  async sendDisputeCreatedEmail(
    userEmail: string,
    userName: string,
    disputeId: string,
    category: string,
  ): Promise<boolean> {
    const subject = 'Dispute Created - NexaFx';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Dispute Created Successfully</h2>
        <p>Dear ${this.escapeHtml(userName)},</p>
        <p>We have received your dispute request and are reviewing it. Here are the details:</p>
        <ul>
          <li><strong>Dispute ID:</strong> ${this.escapeHtml(disputeId)}</li>
          <li><strong>Category:</strong> ${this.formatCategory(category)}</li>
          <li><strong>Status:</strong> Under Review</li>
        </ul>
        <p>Our support team will investigate your dispute and get back to you within 24 hours.</p>
        <p>You can track the progress of your dispute in your account dashboard.</p>
        <p>If you have any questions, please contact our support team.</p>
        <br>
        <p>Best regards,<br>The NexaFx Team</p>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject,
      html,
      text: `Dispute Created - ID: ${disputeId}, Category: ${category}. We will review and respond within 24 hours.`,
    });
  }

  async sendDisputeResolvedEmail(
    userEmail: string,
    userName: string,
    disputeId: string,
    outcome: string,
    refundAmount?: number,
  ): Promise<boolean> {
    const subject = 'Dispute Resolved - NexaFx';
    const refundText = refundAmount
      ? `A refund of ₦${refundAmount.toLocaleString()} has been processed.`
      : '';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">Dispute Resolved</h2>
        <p>Dear ${this.escapeHtml(userName)},</p>
        <p>Your dispute has been resolved. Here are the details:</p>
        <ul>
          <li><strong>Dispute ID:</strong> ${this.escapeHtml(disputeId)}</li>
          <li><strong>Outcome:</strong> ${this.formatOutcome(outcome)}</li>
          ${refundAmount ? `<li><strong>Refund Amount:</strong> ₦${refundAmount.toLocaleString()}</li>` : ''}
        </ul>
        ${refundText ? `<p>${this.escapeHtml(refundText)}</p>` : ''}
        <p>Thank you for using NexaFx. If you have any questions about this resolution, please contact our support team.</p>
        <br>
        <p>Best regards,<br>The NexaFx Team</p>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject,
      html,
      text: `Dispute Resolved - ID: ${disputeId}, Outcome: ${outcome}${refundText ? `, ${refundText}` : ''}`,
    });
  }

  async sendDisputeAssignedEmail(
    agentEmail: string,
    agentName: string,
    disputeId: string,
    priority: string,
  ): Promise<boolean> {
    const subject = 'New Dispute Assignment - NexaFx';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #007bff;">New Dispute Assignment</h2>
        <p>Dear ${this.escapeHtml(agentName)},</p>
        <p>A new dispute has been assigned to you:</p>
        <ul>
          <li><strong>Dispute ID:</strong> ${this.escapeHtml(disputeId)}</li>
          <li><strong>Priority:</strong> ${this.escapeHtml(priority)}</li>
          <li><strong>Assignment Time:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p>Please review and take appropriate action as soon as possible.</p>
        <p><a href="${process.env.FRONTEND_URL}/admin/disputes/${this.escapeHtml(disputeId)}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Dispute</a></p>
        <br>
        <p>Best regards,<br>The NexaFx Team</p>
      </div>
    `;

    return this.sendEmail({
      to: agentEmail,
      subject,
      html,
      text: `New dispute assignment - ID: ${disputeId}, Priority: ${priority}`,
    });
  }

  async sendDisputeCommentEmail(
    userEmail: string,
    userName: string,
    disputeId: string,
  ): Promise<boolean> {
    const subject = 'New Comment on Your Dispute - NexaFx';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #007bff;">New Comment Added</h2>
        <p>Dear ${this.escapeHtml(userName)},</p>
        <p>There is a new comment on your dispute:</p>
        <ul>
          <li><strong>Dispute ID:</strong> ${this.escapeHtml(disputeId)}</li>
        </ul>
        <p>You can reply or view details in your dashboard.</p>
        <p><a href="${process.env.FRONTEND_URL}/disputes/${this.escapeHtml(disputeId)}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Dispute</a></p>
        <br>
        <p>Best regards,<br>The NexaFx Team</p>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject,
      html,
      text: `New comment on dispute ${disputeId}. Log in to view and reply.`,
    });
  }

  async sendDisputeEscalatedEmail(
    userEmail: string,
    userName: string,
    disputeId: string,
  ): Promise<boolean> {
    const subject = 'Dispute Escalated - NexaFx';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #fd7e14;">Dispute Escalated</h2>
        <p>Dear ${this.escapeHtml(userName)},</p>
        <p>Your dispute has been escalated for further review by a senior agent.</p>
        <ul>
          <li><strong>Dispute ID:</strong> ${this.escapeHtml(disputeId)}</li>
          <li><strong>Status:</strong> Escalated</li>
        </ul>
        <p>We will keep you updated on any progress.</p>
        <p><a href="${process.env.FRONTEND_URL}/disputes/${this.escapeHtml(disputeId)}" style="background-color: #fd7e14; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Dispute</a></p>
        <br>
        <p>Best regards,<br>The NexaFx Team</p>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject,
      html,
      text: `Your dispute ${disputeId} has been escalated for further review.`,
    });
  }

  async sendSlaViolationEmail(
    managerEmail: string,
    managerName: string,
    disputeId: string,
    slaDeadline: Date,
  ): Promise<boolean> {
    const subject = 'SLA Violation Alert - NexaFx';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">SLA Violation Alert</h2>
        <p>Dear ${this.escapeHtml(managerName)},</p>
        <p>A dispute has violated its SLA deadline:</p>
        <ul>
          <li><strong>Dispute ID:</strong> ${this.escapeHtml(disputeId)}</li>
          <li><strong>SLA Deadline:</strong> ${slaDeadline.toLocaleString()}</li>
          <li><strong>Violation Time:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p>Please review and escalate this dispute immediately.</p>
        <p><a href="${process.env.FRONTEND_URL}/admin/disputes/${this.escapeHtml(disputeId)}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Dispute</a></p>
        <br>
        <p>Best regards,<br>The NexaFx Team</p>
      </div>
    `;

    return this.sendEmail({
      to: managerEmail,
      subject,
      html,
      text: `SLA Violation - Dispute ID: ${disputeId}, Deadline: ${slaDeadline.toLocaleString()}`,
    });
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
    const value = categoryMap[category] || category;
    return this.escapeHtml(value);
  }

  private formatOutcome(outcome: string): string {
    const outcomeMap: Record<string, string> = {
      user_favor: 'Resolved in Your Favor',
      merchant_favor: 'Resolved in Merchant Favor',
      split: 'Split Decision',
    };
    const value = outcomeMap[outcome] || outcome;
    return this.escapeHtml(value);
  }
}
