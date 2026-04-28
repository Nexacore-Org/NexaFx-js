import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationPreferenceEntity,
  NOTIFICATION_TYPES,
  DeliveryChannelPref,
} from '../entities/notification-preference.entity';

export interface UpdatePreferenceDto {
  notificationType: string;
  inApp?: boolean;
  push?: boolean;
  sms?: boolean;
  email?: boolean;
}

const SECURITY_TYPE = 'SECURITY';
const CACHE_TTL_MS = 30_000;

@Injectable()
export class NotificationPreferenceService {
  private readonly logger = new Logger(NotificationPreferenceService.name);
  private readonly cache = new Map<string, { data: NotificationPreferenceEntity[]; expiresAt: number }>();

  constructor(
    @InjectRepository(NotificationPreferenceEntity)
    private readonly repo: Repository<NotificationPreferenceEntity>,
  ) {}

  async createDefaultsForUser(userId: string): Promise<void> {
    const existing = await this.repo.find({ where: { userId } });
    const existingTypes = new Set(existing.map((p) => p.notificationType));

    const toCreate = NOTIFICATION_TYPES
      .filter((type) => !existingTypes.has(type))
      .map((type) =>
        this.repo.create({
          userId,
          notificationType: type,
          inApp: true,
          push: true,
          sms: false,
          email: true,
        }),
      );

    if (toCreate.length > 0) {
      await this.repo.save(toCreate);
      this.invalidateCache(userId);
      this.logger.debug(`Created ${toCreate.length} default notification preferences for user ${userId}`);
    }
  }

  async getPreferences(userId: string): Promise<Record<string, NotificationPreferenceEntity[]>> {
    const prefs = await this.getCached(userId);

    // Group by notification type
    const grouped: Record<string, NotificationPreferenceEntity[]> = {};
    for (const pref of prefs) {
      if (!grouped[pref.notificationType]) {
        grouped[pref.notificationType] = [];
      }
      grouped[pref.notificationType].push(pref);
    }
    return grouped;
  }

  async updatePreferences(userId: string, updates: UpdatePreferenceDto[]): Promise<void> {
    await this.repo.manager.transaction(async (manager) => {
      for (const update of updates) {
        // SECURITY type cannot be disabled - log warning and skip
        if (update.notificationType === SECURITY_TYPE) {
          this.logger.warn(`Attempted to disable SECURITY notifications for user ${userId} - rejected`);
          continue;
        }

        let pref = await manager.findOne(NotificationPreferenceEntity, {
          where: { userId, notificationType: update.notificationType },
        });

        if (!pref) {
          pref = manager.create(NotificationPreferenceEntity, { userId, notificationType: update.notificationType });
        }

        if (update.inApp !== undefined) pref.inApp = update.inApp;
        if (update.push !== undefined) pref.push = update.push;
        if (update.sms !== undefined) pref.sms = update.sms;
        if (update.email !== undefined) pref.email = update.email;

        await manager.save(pref);
      }
    });

    // Invalidate cache immediately after update
    this.invalidateCache(userId);
    this.logger.log(`Notification preferences updated for user ${userId}`);
  }

  async isChannelEnabled(
    userId: string,
    notificationType: string,
    channel: DeliveryChannelPref,
  ): Promise<boolean> {
    // SECURITY is always delivered
    if (notificationType === SECURITY_TYPE) return true;

    const prefs = await this.getCached(userId);
    const pref = prefs.find((p) => p.notificationType === notificationType);

    if (!pref) return true; // default to enabled if no preference set

    switch (channel) {
      case DeliveryChannelPref.IN_APP:
        return pref.inApp;
      case DeliveryChannelPref.PUSH:
        return pref.push;
      case DeliveryChannelPref.SMS:
        return pref.sms;
      case DeliveryChannelPref.EMAIL:
        return pref.email;
      default:
        return true;
    }
  }

  private async getCached(userId: string): Promise<NotificationPreferenceEntity[]> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const data = await this.repo.find({ where: { userId } });
    this.cache.set(userId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  }

  private invalidateCache(userId: string): void {
    this.cache.delete(userId);
  }
}
