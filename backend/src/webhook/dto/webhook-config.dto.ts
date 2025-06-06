import { IsEnum, IsString, IsOptional, IsNumber, Min, Max } from "class-validator"
import { WebhookProvider } from "../entities/webhook-log.entity"

export class WebhookConfigDto {
  @IsEnum(WebhookProvider)
  provider: WebhookProvider

  @IsString()
  secret: string

  @IsOptional()
  @IsString()
  signatureHeader?: string

  @IsOptional()
  @IsString()
  timestampHeader?: string

  @IsOptional()
  @IsNumber()
  @Min(60)
  @Max(3600)
  toleranceSeconds?: number
}
