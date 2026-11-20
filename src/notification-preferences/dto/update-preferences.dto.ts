import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  NotificationChannel,
  NotificationEventType,
  preferenceKey,
} from '../notification-preference.entity';

export const MAX_PREFERENCES_PER_REQUEST = 50;

@ValidatorConstraint({ name: 'uniquePreferencePairs', async: false })
class UniquePreferencePairs implements ValidatorConstraintInterface {
  validate(items: UpdatePreferenceDto[]): boolean {
    if (!Array.isArray(items)) return true;
    const keys = items.map((item) =>
      preferenceKey(item.channel, item.eventType),
    );
    return new Set(keys).size === keys.length;
  }

  defaultMessage(): string {
    return 'Duplicate (channel,eventType) pairs are not allowed';
  }
}

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
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_PREFERENCES_PER_REQUEST)
  @Validate(UniquePreferencePairs)
  @ValidateNested({ each: true })
  @Type(() => UpdatePreferenceDto)
  preferences: UpdatePreferenceDto[];
}
