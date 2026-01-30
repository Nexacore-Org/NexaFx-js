import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsUUID,
  Min,
  MaxLength,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGoalDto {
  @ApiProperty({ description: 'Goal title', example: 'Save for vacation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: 'Goal description', example: 'Trip to Japan in summer' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ description: 'Target amount to save', example: 5000 })
  @IsNumber()
  @Min(0.01)
  targetAmount: number;

  @ApiPropertyOptional({ description: 'Currency code', example: 'USD', default: 'USD' })
  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Deadline date', example: '2025-12-31T23:59:59Z' })
  @IsDateString()
  @IsOptional()
  deadline?: string;

  @ApiPropertyOptional({ description: 'ID of wallet to link for progress tracking' })
  @IsUUID()
  @IsOptional()
  linkedWalletId?: string;

  @ApiPropertyOptional({ description: 'Initial amount already saved', example: 0, default: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  currentAmount?: number;
}