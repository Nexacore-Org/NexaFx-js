import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateFeeRuleDto } from './create-fee-rule.dto';

export class UpdateFeeRuleDto extends PartialType(CreateFeeRuleDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
