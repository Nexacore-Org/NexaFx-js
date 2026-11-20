import { Injectable } from '@nestjs/common';
import { EmailQueueService } from '../mail/email-queue.service';
import { MailService, RawEmail } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { ScheduledReport } from './entities/scheduled-report.entity';
import { GeneratedReport } from './generators/report-generator.interface';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class ScheduledReportDeliveryService {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailQueue: EmailQueueService,
    private readonly mailService: MailService,
  ) {}

  async deliver(
    report: ScheduledReport,
    generated: GeneratedReport,
  ): Promise<void> {
    const user = await this.usersService.findById(report.userId);
    const payload: RawEmail = {
      to: user.email,
      subject: `Your NexaFx ${report.reportType} report is ready`,
      text: generated.emailText,
      html:
        `<p>${escapeHtml(generated.emailText)}</p>` +
        '<p>Open your NexaFx account to view the report.</p>',
    };

    if (!(await this.emailQueue.enqueue(payload))) {
      await this.mailService.sendRaw(payload);
    }
  }
}
