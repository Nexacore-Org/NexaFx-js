import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferenceEntity } from './entities/user-preference.entity';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserPreferenceEntity)
    private readonly preferencesRepo: Repository<UserPreferenceEntity>,
  ) {}

  async getPreferences(userId: string): Promise<UserPreferenceEntity> {
    let prefs = await this.preferencesRepo.findOne({ where: { userId } });
    if (!prefs) {
      // Create default preferences if they don't exist
      prefs = this.preferencesRepo.create({ userId, theme: 'system' });
      await this.preferencesRepo.save(prefs);
    }
    return prefs;
  }

  async updatePreferences(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferenceEntity> {
    let prefs = await this.preferencesRepo.findOne({ where: { userId } });
    
    if (!prefs) {
      prefs = this.preferencesRepo.create({ userId, ...dto });
    } else {
      this.preferencesRepo.merge(prefs, dto);
    }

    return this.preferencesRepo.save(prefs);
  }
}
