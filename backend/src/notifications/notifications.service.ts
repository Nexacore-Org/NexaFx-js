import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { NotificationPreference } from './schemas/notification-preference.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue('notification-queue')
    private readonly notificationQueue: Queue,
    @InjectModel(NotificationPreference.name)
    private readonly prefModel: Model<NotificationPreference>,
  ) {}

  // This is called by your blockchain listener or other parts of your app
  async triggerNotification(userId: string, eventType: string, data: any) {
    const preferences = await this.prefModel.findOne({ userId });

    if (!preferences || !preferences.eventTypes[eventType]) {
      console.log(
        `Notifications for event ${eventType} are disabled for user ${userId}.`,
      );
      return;
    }

    for (const channel in preferences.channels) {
      if (preferences.channels[channel].enabled) {
        // Add a job to the queue for each enabled channel
        await this.notificationQueue.add('send-notification', {
          userId,
          channel,
          eventType,
          data,
        });
      }
    }
  }
}
