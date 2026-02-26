import {
  IsEnum,
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
  Length,
} from 'class-validator';
import { FeeRuleType } from '../entities/fee-rule.entity';

export class CreateFeeRuleDto {
  @IsEnum(['PERCENTAGE', 'FLAT', 'TIERED', 'PROMOTIONAL'])
  ruleType: FeeRuleType;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  percentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  flatFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsString()
  promoCode?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
