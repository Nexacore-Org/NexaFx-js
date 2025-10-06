import { IsEnum, IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeOutcome } from '../entities/dispute.entity';

export class ResolveDisputeDto {
  @ApiProperty({
    enum: DisputeOutcome,
    description: 'Dispute resolution outcome',
  })
  @IsEnum(DisputeOutcome)
  outcome: DisputeOutcome;

  @ApiProperty({ description: 'Resolution details' })
  @IsString()
  outcomeDetails: string;

  @ApiPropertyOptional({ description: 'Resolution notes' })
  @IsOptional()
  @IsString()
  resolutionNotes?: string;

  @ApiPropertyOptional({
    description: 'Refund amount in kobo (smallest currency unit)',
  })
  @IsOptional()
  @IsInt({ message: 'Refund amount must be an integer' })
  @Min(0, { message: 'Refund amount must be non-negative' })
  @Max(1000000000, { message: 'Refund amount exceeds maximum allowed value' }) // 10M Naira in kobo
  refundAmount?: number;

  @ApiPropertyOptional({ description: 'Refund transaction ID' })
  @IsOptional()
  @IsString()
  refundTransactionId?: string;
}
