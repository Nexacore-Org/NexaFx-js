import { IsEnum, IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeCategory, DisputeState } from '../entities/dispute.entity';

export class UpdateDisputeDto {
  @ApiPropertyOptional({
    enum: DisputeCategory,
    description: 'Dispute category',
  })
  @IsOptional()
  @IsEnum(DisputeCategory)
  category?: DisputeCategory;

  @ApiPropertyOptional({ description: 'Dispute description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Disputed amount in Naira' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountNaira?: number;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: DisputeState, description: 'Dispute state' })
  @IsOptional()
  @IsEnum(DisputeState)
  state?: DisputeState;
}
