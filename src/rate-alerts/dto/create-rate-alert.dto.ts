import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsNumber, Matches, Min } from 'class-validator';
import { SUPPORTED_EXCHANGE_RATE_PAIRS } from '../../exchange-rates/exchange-rate.constants';

export enum RateAlertDirection {
  ABOVE = 'above',
  BELOW = 'below',
}

export class CreateRateAlertDto {
  @Matches(/^[A-Z]{3}\/[A-Z]{3}$/)
  @IsIn(SUPPORTED_EXCHANGE_RATE_PAIRS)
  currencyPair: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  targetRate: number;

  @IsEnum(RateAlertDirection)
  direction: RateAlertDirection;
}
