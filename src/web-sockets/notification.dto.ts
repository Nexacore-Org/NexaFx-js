import { IsString, IsOptional, IsObject, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationEvent, NOTIFICATION_EVENTS } from '../notifications.constants';

export class EmitNotificationDto {
  @ApiProperty({ description: 'Target user ID (omit for broadcast)' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ enum: NOTIFICATION_EVENTS })
  @IsEnum(NOTIFICATION_EVENTS)
  event: NotificationEvent;

  @ApiProperty()
  @IsObject()
  payload: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'ISO timestamp override' })
  @IsOptional()
  @IsDateString()
  timestamp?: string;
}

export class SubscribeChannelDto {
  @ApiProperty()
  @IsString()
  channel: string;
}

export class MissedEventsRequestDto {
  @ApiProperty({ description: 'Client last-seen event timestamp (ISO)' })
  @IsDateString()
  since: string;

  @ApiPropertyOptional({ description: 'Maximum events to return', default: 50 })
  @IsOptional()
  limit?: number;
}

export class WsAuthDto {
  @ApiProperty({ description: 'Bearer JWT token' })
  @IsString()
  token: string;
}
