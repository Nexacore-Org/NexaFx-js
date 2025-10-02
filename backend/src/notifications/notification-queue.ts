import { Processor, Process } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { EmailService } from './providers/email.service';
import { SmsService } from './providers/sms.service';
import { PushService } from './providers/push.service';
import { Notification } from './schemas/notification.schema';

@Injectable()
@Processor('notification-queue', {
  concurrency: 10,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
})
export class NotificationsProcessor {
  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly pushService: PushService,
  ) {}

  @Process('send-notification')
  async handleSendNotification(job: Job<any>) {
    const { userId, channel, eventType, data } = job.data;
    const { title, body, template } = this.generateContent(eventType, data);

    const log = await this.notificationModel.create({ userId, channel, type: eventType, title, body, data });

    try {
      switch (channel) {
        case 'email':
          await this.emailService.sendEmail('user@example.com', title, template, data);
          break;
        case 'sms':
          await this.smsService.sendSms('+2348012345678', body);
          break;
        case 'push':
          await this.pushService.sendPush(['fcm-token-123'], title, body, data);
          break;
      }
      await this.notificationModel.findByIdAndUpdate(log._id, { status: 'sent' });
    } catch (error) {
      await this.notificationModel.findByIdAndUpdate(log._id, { status: 'failed' });
      throw error; // Re-throw to trigger BullMQ's retry mechanism
    }
  }

  private generateContent(eventType: string, data: any) {

    switch (eventType) {
      case 'transactionReceived':
        return {
          title: 'Incoming Transaction!',
          body: `You just received ${data.amount} NGN from ${data.from}.`,
          template: 'transactionReceived', 
        };
      default:
        return { title: 'Notification', body: 'You have a new update.', template: 'default' };
    }
  }
}