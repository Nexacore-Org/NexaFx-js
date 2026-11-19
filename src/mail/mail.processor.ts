import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { EMAIL_JOB_NAMES, QUEUE_NAMES } from '../queues/queue.constants';
import { MailService } from './mail.service';
import { MailProcessor, SendEmailJobData } from './mail.processor';

/** SMTP errors that will never succeed on retry. */
const PERMANENT_RESPONSE_CODES = new Set([550, 551, 552, 553, 554]);

@Processor(QUEUE_NAMES.EMAIL)
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {}

  @Process(EMAIL_JOB_NAMES.SEND_EMAIL)
  async handleSendEmail(job: Job<SendEmailJobData>): Promise<void> {
    this.logger.log(`Processing email job ${job.id} (${job.name})`);

    const { to, subject, html, text, from } = job.data;

    if (!to || !subject) {
      job.discard();
      throw new Error('Missing required email fields: to, subject');
    }

    try {
      // Send the queued body unchanged: it is already a rendered template.
      await this.mailService.send({ to, subject, html, text, from });
    } catch (err) {
      if (this.isPermanentFailure(err)) {
        job.discard();
      }
      // Rethrow so Bull records the failure and retries transient errors.
      throw err;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<SendEmailJobData>, error: Error): void {
    const maxAttempts = job.opts.attempts ?? 1;
    const isDeadLetter = job.attemptsMade >= maxAttempts;

    if (isDeadLetter) {
      this.logger.error(
        `[DEAD-LETTER] email-queue job ${job.id} (${job.name}) permanently failed ` +
          `after ${job.attemptsMade} attempt(s): ${error.message}`,
        error.stack,
      );
    } else {
      this.logger.warn(
        `email-queue job ${job.id} (${job.name}) failed on attempt ${job.attemptsMade} ` +
          `of ${maxAttempts}: ${error.message}`,
      );
    }
  }

  @OnQueueError()
  onError(error: Error): void {
    this.logger.error(
      `email-queue encountered an error: ${error.message}`,
      error.stack,
    );
  }

  private isPermanentFailure(error: unknown): boolean {
    const err = error as {
      responseCode?: number;
      statusCode?: number;
      code?: string;
      response?: string;
      message?: string;
    };

    const responseCode = err?.responseCode ?? err?.statusCode;
    if (typeof responseCode === 'number' && PERMANENT_RESPONSE_CODES.has(responseCode)) {
      return true;
    }
    if (err?.code === 'EENVELOPE') {
      return true;
    }

    const text = `${err?.response ?? ''} ${err?.message ?? ''}`;
    return /invalid recipient|recipient address rejected|mailbox unavailable|user unknown/i.test(
      text,
    );
  }
}
