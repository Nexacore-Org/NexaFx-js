import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsUrl,
} from 'class-validator';
import {
  CUSTOMER_WEBHOOK_EVENTS,
  CustomerWebhookEvent,
} from '../webhook-events';
import { WebhookEndpoint } from '../webhook-endpoint.entity';

export const MAX_WEBHOOK_EVENTS = 20;

/** HTTPS URL plus a non-empty, bounded list of customer-facing events (#1609). */
export class CreateWebhookEndpointRequestDto {
  @ApiProperty({ example: 'https://hooks.example.com/nexafx' })
  @IsUrl({ protocols: ['https'], require_tld: true })
  url!: string;

  @ApiProperty({
    type: [String],
    enum: CUSTOMER_WEBHOOK_EVENTS,
    example: ['transactions.completed'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_WEBHOOK_EVENTS)
  @IsIn(CUSTOMER_WEBHOOK_EVENTS as readonly string[], { each: true })
  events!: CustomerWebhookEvent[];
}

export class UpdateWebhookEndpointRequestDto {
  @ApiPropertyOptional({ example: 'https://hooks.example.com/nexafx-v2' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_tld: true })
  url?: string;

  @ApiPropertyOptional({
    type: [String],
    enum: CUSTOMER_WEBHOOK_EVENTS,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_WEBHOOK_EVENTS)
  @IsIn(CUSTOMER_WEBHOOK_EVENTS as readonly string[], { each: true })
  events?: CustomerWebhookEvent[];
}

/** Never carries the signing secret; safe for list/get and logs. */
export class WebhookEndpointResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty({ type: [String], enum: CUSTOMER_WEBHOOK_EVENTS })
  events!: CustomerWebhookEvent[];

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

/** The plaintext secret is returned exactly once, from the create call. */
export class CreateWebhookEndpointResponseDto extends WebhookEndpointResponseDto {
  @ApiProperty({ description: 'Shown only once; store it in your receiver.' })
  secret!: string;
}

export function toWebhookEndpointResponse(
  endpoint: WebhookEndpoint,
): WebhookEndpointResponseDto {
  return {
    id: endpoint.id,
    ownerId: endpoint.ownerId,
    url: endpoint.url,
    events: endpoint.events as CustomerWebhookEvent[],
    isActive: endpoint.isActive,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}
