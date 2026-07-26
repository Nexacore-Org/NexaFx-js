import { Processor, Process, OnQueueFailed, OnQueueError } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { EMAIL_JOB_NAMES, QUEUE_NAMES } from '../queues/queue.constants';

export interface SendEmailJobData {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

@Processor(QUEUE_NAMES.EMAIL)
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);

  @Process(EMAIL_JOB_NAMES.SEND_EMAIL)
  handleSendEmail(job: Job<SendEmailJobData>): void {
    this.logger.log(
      `Processing job ${job.id} (${job.name}) — sending email to ${job.data.to}`,
    );

    const { to, subject, html, text } = job.data;

    if (!to || !subject) {
      throw new Error('Missing required email fields: to, subject');
    }

    // Nodemailer / mail-service integration point.
    // Injected transport would be called here; kept as a stub so the
    // processor can be tested without a live SMTP connection.
    this.logger.log(
      `Email dispatched to ${to} with subject "${subject}" (html=${!!html}, text=${!!text})`,
    );
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
}
