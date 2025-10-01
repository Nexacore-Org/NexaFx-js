import { IsUrl, IsArray, IsEnum, ArrayNotEmpty } from 'class-validator';
import { WebhookEvent } from '../entities/webhook.entity';

export class CreateWebhookDto {
  @IsUrl()
  url: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(WebhookEvent, { each: true })
  subscribedEvents: WebhookEvent[];
}