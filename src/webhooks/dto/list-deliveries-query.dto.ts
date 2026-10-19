import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { WebhookDeliveryStatus } from '../webhook-delivery.entity';

/**
 * Query parameters for the paginated webhook delivery history (#1446).
 *
 * The endpoint previously returned every delivery row for every tenant, so a
 * busy integrator's history was unbounded. Every field is optional; the
 * controller/service applies the defaults.
 */
export class ListDeliveriesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(WebhookDeliveryStatus)
  status?: WebhookDeliveryStatus;

  /** Inclusive lower bound on `createdAt` (ISO 8601). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive upper bound on `createdAt` (ISO 8601). */
  @IsOptional()
  @IsDateString()
  to?: string;
}
