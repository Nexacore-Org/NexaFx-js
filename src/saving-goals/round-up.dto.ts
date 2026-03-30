// src/goals/dto/round-up-rule.dto.ts
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRoundUpRuleDto {
  @ApiProperty({ description: 'Enable or disable round-up contributions' })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({
    description: 'Round up to nearest unit (1, 5, or 10)',
    enum: [1, 5, 10],
  })
  @IsOptional()
  @IsIn([1, 5, 10])
  unit?: 1 | 5 | 10;

  @ApiPropertyOptional({ description: 'Wallet ID to draw round-ups from' })
  @IsOptional()
  @IsUUID()
  linkedWalletId?: string;
}

// src/goals/dto/get-contributions.dto.ts
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetContributionsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// src/goals/dto/contribution-response.dto.ts
import { ContributionSource } from '../entities/goal-contribution.entity';

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
