import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  isMandatoryPreference,
  NotificationChannel,
  NotificationEventType,
  NotificationPreference,
  preferenceKey,
} from './notification-preference.entity';
import { UpdatePreferenceDto } from './dto/update-preferences.dto';

export type { UpdatePreferenceDto } from './dto/update-preferences.dto';

const CONFLICT_PATHS = ['userId', 'channel', 'eventType'];

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
    this.assertMutable(dto);
    await this.repo.upsert(this.toUpsert(userId, dto), {
      conflictPaths: CONFLICT_PATHS,
    });
    return this.repo.findOneOrFail({
      where: { userId, channel: dto.channel, eventType: dto.eventType },
    });
  }

  async updatePreferences(
    userId: string,
    dtos: UpdatePreferenceDto[],
  ): Promise<NotificationPreference[]> {
    const unique = new Map<string, UpdatePreferenceDto>();
    for (const dto of dtos) {
      this.assertMutable(dto);
      unique.set(preferenceKey(dto.channel, dto.eventType), dto);
    }

    return this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(NotificationPreference);
      const results: NotificationPreference[] = [];
      for (const dto of unique.values()) {
        await repo.upsert(this.toUpsert(userId, dto), {
          conflictPaths: CONFLICT_PATHS,
        });
        results.push(
          await repo.findOneOrFail({
            where: { userId, channel: dto.channel, eventType: dto.eventType },
          }),
        );
      }
      return results;
    });
  }

  async shouldNotify(
    userId: string,
    channel: NotificationChannel,
    eventType: NotificationEventType,
  ): Promise<boolean> {
    if (isMandatoryPreference(channel, eventType)) return true;

    const pref = await this.repo.findOne({
      where: { userId, channel, eventType },
    });
    return pref ? pref.isEnabled : true;
  }

  private assertMutable(dto: UpdatePreferenceDto): void {
    if (
      dto.isEnabled === false &&
      isMandatoryPreference(dto.channel, dto.eventType)
    ) {
      throw new BadRequestException(
        `Security notifications on ${dto.channel} cannot be disabled`,
      );
    }
  }

  private toUpsert(userId: string, dto: UpdatePreferenceDto) {
    return {
      userId,
      channel: dto.channel,
      eventType: dto.eventType,
      isEnabled: dto.isEnabled,
      batchingEnabled: dto.batchingEnabled ?? true,
    };
  }
}
