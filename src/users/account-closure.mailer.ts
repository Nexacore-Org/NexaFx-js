import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

@Injectable()
export class AccountClosureMailer {
  constructor(private readonly configService: ConfigService) {}

  async sendFinalConfirmation(
    emailAddress: string,
    displayName: string,
  ): Promise<void> {
    const host = this.configService.get<string>('mail.host');
    const user = this.configService.get<string>('mail.user');
    const password = this.configService.get<string>('mail.password');
    const from = this.configService.get<string>('mail.from');
    const port = this.configService.get<number>('mail.port') ?? 587;
    const secure = this.configService.get<boolean>('mail.secure') ?? false;

    if (!host || !user || !password || !from) {
      return;
    }

    const transporter = createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass: password,
      },
    });

    await transporter.sendMail({
      from,
      to: emailAddress,
      subject: 'Your NexaFx account has been closed',
      text: `Hi ${displayName}, your NexaFx account has been closed and will be retained for the required financial-record retention period before PII is purged.`,
    });
  }
}
