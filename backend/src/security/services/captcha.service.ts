import { Injectable, Logger } from '@nestjs/common';
import { verify } from 'hcaptcha';

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly secret: string;

  constructor() {
    this.secret = process.env.HCAPTCHA_SECRET || '';
    if (!this.secret) {
      this.logger.warn('HCAPTCHA_SECRET not configured');
    }
  }

  async verifyCaptcha(token: string, remoteIP?: string): Promise<boolean> {
    if (!this.secret) {
      this.logger.warn('Captcha verification skipped - no secret configured');
      return true;
    }

    try {
      const result = await verify(this.secret, token, remoteIP);
      return result.success;
    } catch (err) {
      this.logger.error('Error verifying captcha:', err);
      return false;
    }
  }

  isCaptchaRequired(failedAttempts: number): boolean {
    return failedAttempts >= 3;
  }
}
