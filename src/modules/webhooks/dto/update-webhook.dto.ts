import { IsArray, IsIn, IsOptional } from 'class-validator';
import { WEBHOOK_EVENT_NAMES } from '../webhook-event-catalog';

export class UpdateWebhookDto {
  @IsOptional()
  @IsArray()
  @IsIn(WEBHOOK_EVENT_NAMES, { each: true })
  events?: string[];

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}
