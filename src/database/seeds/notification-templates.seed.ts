import { DataSource } from 'typeorm';
import {
  NotificationTemplateEntity,
  TemplateChannel,
} from '../../modules/notifications/entities/notification-template.entity';

const EMAIL_TEMPLATES = [
  {
    name: 'password_reset',
    channel: TemplateChannel.EMAIL,
    locale: 'en',
    subjectTemplate: 'Reset Your Password',
    bodyTemplate: `<p>Hi,</p><p>Click <a href="{{resetUrl}}">here</a> to reset your password. This link expires in 1 hour.</p>`,
    requiredVariables: ['resetUrl'],
  },
  {
    name: 'email_verification',
    channel: TemplateChannel.EMAIL,
    locale: 'en',
    subjectTemplate: 'Verify Your Email',
    bodyTemplate: `<p>Please verify your email by clicking <a href="{{verifyUrl}}">here</a>.</p>`,
    requiredVariables: ['verifyUrl'],
  },
  {
    name: 'new_device_login',
    channel: TemplateChannel.EMAIL,
    locale: 'en',
    subjectTemplate: 'New Device Login Detected',
    bodyTemplate: `<p>A new login was detected from IP <strong>{{ip}}</strong> using <em>{{userAgent}}</em>. If this wasn't you, secure your account immediately.</p>`,
    requiredVariables: ['ip', 'userAgent'],
  },
  {
    name: 'account_locked',
    channel: TemplateChannel.EMAIL,
    locale: 'en',
    subjectTemplate: 'Account Locked',
    bodyTemplate: `<p>Your account has been locked due to multiple failed login attempts. Please contact support to unlock it.</p>`,
    requiredVariables: [],
  },
  {
    name: 'transaction_completed',
    channel: TemplateChannel.EMAIL,
    locale: 'en',
    subjectTemplate: 'Transaction Completed — {{amount}} {{currency}}',
    bodyTemplate: `<p>Your transaction of <strong>{{amount}} {{currency}}</strong> has been completed successfully.</p><p>Transaction ID: {{transactionId}}</p>`,
    requiredVariables: ['amount', 'currency', 'transactionId'],
  },
  {
    name: 'transaction_failed',
    channel: TemplateChannel.EMAIL,
    locale: 'en',
    subjectTemplate: 'Transaction Failed',
    bodyTemplate: `<p>Your transaction of <strong>{{amount}} {{currency}}</strong> failed. Reason: {{reason}}.</p>`,
    requiredVariables: ['amount', 'currency', 'reason'],
  },
  {
    name: 'fraud_alert',
    channel: TemplateChannel.EMAIL,
    locale: 'en',
    subjectTemplate: 'Security Alert: Suspicious Activity Detected',
    bodyTemplate: `<p>We detected suspicious activity on your account. Transaction ID: {{transactionId}}. Risk score: {{riskScore}}.</p>`,
    requiredVariables: ['transactionId', 'riskScore'],
  },
];

const SMS_TEMPLATES = [
  {
    name: 'transaction_completed',
    channel: TemplateChannel.SMS,
    locale: 'en',
    subjectTemplate: null,
    bodyTemplate: `NexaFx: Transaction {{transactionId}} of {{amount}} {{currency}} completed.`,
    requiredVariables: ['transactionId', 'amount', 'currency'],
  },
  {
    name: 'fraud_alert',
    channel: TemplateChannel.SMS,
    locale: 'en',
    subjectTemplate: null,
    bodyTemplate: `NexaFx ALERT: Suspicious activity on your account. Tx: {{transactionId}}. Contact support if not you.`,
    requiredVariables: ['transactionId'],
  },
];

export async function seedNotificationTemplates(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(NotificationTemplateEntity);

  const allTemplates = [...EMAIL_TEMPLATES, ...SMS_TEMPLATES];

  for (const tpl of allTemplates) {
    const exists = await repo.findOne({
      where: { name: tpl.name, channel: tpl.channel, locale: tpl.locale, isArchived: false },
    });
    if (!exists) {
      await repo.save(repo.create({ ...tpl, version: 1, isArchived: false }));
    }
  }
}
