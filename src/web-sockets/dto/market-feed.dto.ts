import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SubscribePriceFeedDto {
  @IsArray()
  @IsString({ each: true })
  pairs: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(60000)
  intervalMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(60000)
  minIntervalMs?: number;
}

export class UnsubscribePriceFeedDto {
  @IsArray()
  @IsString({ each: true })
  pairs: string[];
}

export class SubscribePositionFeedDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(60000)
  minIntervalMs?: number;
}
