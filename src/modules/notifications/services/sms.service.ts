import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsDeliveryResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

/**
 * SMSService sends SMS messages via a configurable provider (Twilio or Africa's Talking).
 * Provider is selected via SMS_PROVIDER env var ('twilio' | 'africastalking').
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: string;

  constructor(private readonly config: ConfigService) {
    this.provider = this.config.get<string>('SMS_PROVIDER', 'twilio');
  }

  async send(message: SmsMessage): Promise<SmsDeliveryResult> {
    if (this.provider === 'africastalking') {
      return this.sendViaAfricasTalking(message);
    }
    return this.sendViaTwilio(message);
  }

  private async sendViaTwilio(message: SmsMessage): Promise<SmsDeliveryResult> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_FROM_NUMBER');

    if (!accountSid || !authToken || !from) {
      this.logger.error('Twilio credentials not configured');
      return { success: false, provider: 'twilio', error: 'Twilio credentials not configured' };
    }

    try {
      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

      const body = new URLSearchParams({
        To: message.to,
        From: from,
        Body: message.body,
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`Twilio SMS failed (${response.status}): ${text}`);
        return { success: false, provider: 'twilio', error: `HTTP ${response.status}: ${text}` };
      }

      const data = await response.json() as { sid: string };
      return { success: true, provider: 'twilio', messageId: data.sid };
    } catch (err: any) {
      this.logger.error(`Twilio SMS error: ${err.message}`, err.stack);
      return { success: false, provider: 'twilio', error: err.message };
    }
  }

  private async sendViaAfricasTalking(message: SmsMessage): Promise<SmsDeliveryResult> {
    const username = this.config.get<string>('AT_USERNAME');
    const apiKey = this.config.get<string>('AT_API_KEY');
    const from = this.config.get<string>('AT_FROM_NUMBER', '');

    if (!username || !apiKey) {
      this.logger.error('Africa\'s Talking credentials not configured');
      return { success: false, provider: 'africastalking', error: 'AT credentials not configured' };
    }

    try {
      const body = new URLSearchParams({
        username,
        to: message.to,
        message: message.body,
      });
      if (from) body.set('from', from);

      const response = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`Africa's Talking SMS failed (${response.status}): ${text}`);
        return { success: false, provider: 'africastalking', error: `HTTP ${response.status}: ${text}` };
      }

      const data = await response.json() as { SMSMessageData: { Recipients: { messageId: string }[] } };
      const messageId = data?.SMSMessageData?.Recipients?.[0]?.messageId;
      return { success: true, provider: 'africastalking', messageId };
    } catch (err: any) {
      this.logger.error(`Africa's Talking SMS error: ${err.message}`, err.stack);
      return { success: false, provider: 'africastalking', error: err.message };
    }
  }
}
