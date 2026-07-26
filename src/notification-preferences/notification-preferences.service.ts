import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationPreference,
  NotificationChannel,
  NotificationEventType,
} from './notification-preference.entity';

export interface UpdatePreferenceDto {
  channel: NotificationChannel;
  eventType: NotificationEventType;
  isEnabled: boolean;
}

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @InjectRepository(NotificationPreference)
    private readonly repo: Repository<NotificationPreference>,
  ) {}

  async getPreferences(userId: string): Promise<NotificationPreference[]> {
    return this.repo.find({ where: { userId } });
  }

  async getPreference(
    userId: string,
    channel: NotificationChannel,
    eventType: NotificationEventType,
  ): Promise<NotificationPreference | null> {
    return this.repo.findOne({ where: { userId, channel, eventType } });
  }

  async updatePreference(
    userId: string,
    dto: UpdatePreferenceDto,
  ): Promise<NotificationPreference> {
    let pref = await this.repo.findOne({
      where: {
        userId,
        channel: dto.channel,
        eventType: dto.eventType,
      },
    });

    if (pref) {
      pref.isEnabled = dto.isEnabled;
    } else {
      pref = this.repo.create({
        userId,
        channel: dto.channel,
        eventType: dto.eventType,
        isEnabled: dto.isEnabled,
      });
    }

    return this.repo.save(pref);
  }

  async updatePreferences(
    userId: string,
    dtos: UpdatePreferenceDto[],
  ): Promise<NotificationPreference[]> {
    const results: NotificationPreference[] = [];
    for (const dto of dtos) {
      results.push(await this.updatePreference(userId, dto));
    }
    return results;
  }

  async shouldNotify(
    userId: string,
    channel: NotificationChannel,
    eventType: NotificationEventType,
  ): Promise<boolean> {
    const pref = await this.repo.findOne({
      where: { userId, channel, eventType },
    });

    if (!pref) {
      return true;
    }

    return pref.isEnabled;
  }
}
