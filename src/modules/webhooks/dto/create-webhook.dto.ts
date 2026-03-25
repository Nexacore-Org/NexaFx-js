import { IsArray, IsIn, IsUrl, ArrayMinSize } from 'class-validator';
import { WEBHOOK_EVENT_NAMES } from '../webhook-event-catalog';

export class CreateWebhookDto {
  @IsUrl()
  url: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(WEBHOOK_EVENT_NAMES, { each: true })
  events: string[];
}
