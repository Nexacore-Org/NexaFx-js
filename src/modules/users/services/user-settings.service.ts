import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSettingsEntity } from '../entities/user-settings.entity';
import { UpdateUserSettingsDto } from '../dto/update-user-settings.dto';
import { AdminAuditService } from '../../admin-audit/admin-audit.service';
import { CreateAdminAuditLogDto } from '../../admin-audit/dto/create-admin-audit-log.dto';
import { ActorType } from '../../admin-audit/entities/admin-audit-log.entity';

@Injectable()
export class UserSettingsService {
  constructor(
    @InjectRepository(UserSettingsEntity)
    private readonly settingsRepo: Repository<UserSettingsEntity>,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async getSettings(userId: string): Promise<UserSettingsEntity> {
    let settings = await this.settingsRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = this.settingsRepo.create({ userId });
      await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async updateSettings(
    userId: string,
    dto: UpdateUserSettingsDto,
  ): Promise<UserSettingsEntity> {
    let settings = await this.settingsRepo.findOne({ where: { userId } });

    const before = settings ? { ...settings } : null;

    if (!settings) {
      settings = this.settingsRepo.create({ userId, ...dto });
    } else {
      this.settingsRepo.merge(settings, dto);
    }

    const updated = await this.settingsRepo.save(settings);

    try {
      const auditDto = new CreateAdminAuditLogDto();
      auditDto.actorId = userId;
      auditDto.actorType = ActorType.USER;
      auditDto.action = 'UPDATE_USER_SETTINGS';
      auditDto.entity = 'UserSettings';
      auditDto.entityId = updated.id;
      auditDto.beforeSnapshot = before
        ? {
            displayCurrency: (before as UserSettingsEntity).displayCurrency,
            language: (before as UserSettingsEntity).language,
            timezone: (before as UserSettingsEntity).timezone,
            emailNotifications: (before as UserSettingsEntity).emailNotifications,
            smsNotifications: (before as UserSettingsEntity).smsNotifications,
            pushNotifications: (before as UserSettingsEntity).pushNotifications,
          }
        : null;
      auditDto.afterSnapshot = {
        displayCurrency: updated.displayCurrency,
        language: updated.language,
        timezone: updated.timezone,
        emailNotifications: updated.emailNotifications,
        smsNotifications: updated.smsNotifications,
        pushNotifications: updated.pushNotifications,
      };
      auditDto.description = `User ${userId} updated their settings`;
      await this.adminAuditService.logAction(auditDto);
    } catch {
      // Audit logging failure must not block the update
    }

    return updated;
  }

  async exportSettings(userId: string): Promise<Record<string, any>> {
    const settings = await this.getSettings(userId);
    return {
      displayCurrency: settings.displayCurrency,
      language: settings.language,
      timezone: settings.timezone,
      emailNotifications: settings.emailNotifications,
      smsNotifications: settings.smsNotifications,
      pushNotifications: settings.pushNotifications,
      exportedAt: new Date().toISOString(),
    };
  }

  /** Called on user registration to auto-create default settings */
  async ensureDefaults(userId: string): Promise<void> {
    const exists = await this.settingsRepo.findOne({ where: { userId } });
    if (!exists) {
      await this.settingsRepo.save(this.settingsRepo.create({ userId }));
    }
  }

  /** Returns the displayCurrency for a given user (used by wallet portfolio) */
  async getDisplayCurrency(userId: string): Promise<string> {
    const settings = await this.settingsRepo.findOne({
      where: { userId },
      select: ['displayCurrency'],
    });
    return settings?.displayCurrency ?? 'USD';
  }

  /** Returns the preferred language for a given user (used by email templates) */
  async getLanguage(userId: string): Promise<string> {
    const settings = await this.settingsRepo.findOne({
      where: { userId },
      select: ['language'],
    });
    return settings?.language ?? 'en';
  }
}
