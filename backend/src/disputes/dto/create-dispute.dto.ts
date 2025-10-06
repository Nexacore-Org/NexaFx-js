import {
  IsEnum,
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeCategory } from '../entities/dispute.entity';

export class CreateDisputeDto {
  @ApiProperty({ description: 'Transaction ID to dispute' })
  @IsUUID()
  transactionId: string;

  @ApiProperty({ enum: DisputeCategory, description: 'Dispute category' })
  @IsEnum(DisputeCategory)
  category: DisputeCategory;

  @ApiPropertyOptional({ description: 'Dispute description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Disputed amount in Naira' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      'amountNaira must be a valid monetary format (e.g., 100 or 100.50)',
  })
  amountNaira?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateDisputeWithFilesDto extends CreateDisputeDto {
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Evidence files',
  })
  @IsOptional()
  @IsArray()
  evidenceFiles?: Express.Multer.File[];
}
