import { IsString, IsNumber, IsArray, IsOptional, IsBoolean, Min, IsInt } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateApprovalPolicyDto {
  @IsString()
  transactionType: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredApprovers?: string[];

  @IsInt()
  @Min(1)
  quorumCount: number;
}

export class UpdateApprovalPolicyDto extends PartialType(CreateApprovalPolicyDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
