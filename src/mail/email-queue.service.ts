import { InjectQueue } from '@nestjs/bull';
import { Injectable, Optional } from '@nestjs/common';
import type { Queue } from 'bull';
import {
  EMAIL_JOB_NAMES,
  QUEUE_NAMES,
} from '../queues/queue.constants';
import type { RawEmail } from './mail.service';

/**
 * Small producer for the email queue (#1610). The queue is optional so the app
 * still boots with DISABLE_BULL=true; callers fall back to a direct send.
 */
@Injectable()
export class EmailQueueService {
  constructor(
    @Optional()
    @InjectQueue(QUEUE_NAMES.EMAIL)
    private readonly queue?: Queue,
  ) {}

  isEnabled(): boolean {
    return !!this.queue;
  }

  /** Returns false when Bull is disabled so the caller can send inline. */
  async enqueue(payload: RawEmail): Promise<boolean> {
    if (!this.queue) return false;
    await this.queue.add(EMAIL_JOB_NAMES.SEND_EMAIL, payload);
    return true;
  }

  async enqueuePasswordReset(to: string, resetUrl: string): Promise<boolean> {
    if (!this.queue) return false;
    await this.queue.add(EMAIL_JOB_NAMES.PASSWORD_RESET, { to, resetUrl });
    return true;
  }
}
