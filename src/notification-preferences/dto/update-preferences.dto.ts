import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import {
  NotificationChannel,
  NotificationEventType,
} from '../notification-preference.entity';

export class UpdatePreferenceDto {
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @IsEnum(NotificationEventType)
  eventType: NotificationEventType;

  @IsBoolean()
  isEnabled: boolean;

  @IsOptional()
  @IsBoolean()
  batchingEnabled?: boolean;
}

export class UpdatePreferencesRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePreferenceDto)
  preferences: UpdatePreferenceDto[];
}