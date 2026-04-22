import { IsBoolean, IsIn, IsOptional, IsUUID, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContributionSource } from '../entities/goal-contribution.entity';

export class UpdateRoundUpRuleDto {
  @ApiProperty({ description: 'Enable or disable round-up' })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ enum: [1, 5, 10], description: 'Round-up unit' })
  @IsOptional()
  @IsInt()
  @IsIn([1, 5, 10])
  unit?: number;

  @ApiPropertyOptional({ description: 'Wallet ID to debit round-ups from' })
  @IsOptional()
  @IsUUID()
  linkedWalletId?: string;
}

export class GetContributionsDto {
  @IsOptional()
  page?: number = 1;

  @IsOptional()
  limit?: number = 20;
}

export class ContributionResponseDto {
  id: string;
  amount: string;
  currency: string;
  source: ContributionSource;
  transactionId: string | null;
  progressSnapshot: string;
  createdAt: Date;
}

export class PaginatedContributionsDto {
  data: ContributionResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
