import { IsEnum, IsOptional, IsObject } from 'class-validator';
import { UserTheme } from '../entities/user-preference.entity';

export class UpdateUserPreferencesDto {
  @IsEnum(['light', 'dark', 'system'])
  @IsOptional()
  theme?: UserTheme;

  @IsObject()
  @IsOptional()
  settings?: Record<string, any>;
}
