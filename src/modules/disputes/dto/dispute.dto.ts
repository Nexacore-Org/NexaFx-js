import { IsNotEmpty, IsOptional, IsString, IsArray, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OpenDisputeDto {
  @ApiProperty({ example: 'Unauthorized transaction' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'File IDs for evidence (no binary content)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  evidenceFileIds?: string[];
}

export class ResolveDisputeDto {
  @ApiProperty({ enum: ['RESOLVED', 'REJECTED'] })
  @IsString()
  @IsNotEmpty()
  action: 'RESOLVED' | 'REJECTED';

  @ApiProperty({ example: 'Transaction verified as legitimate' })
  @IsString()
  @IsNotEmpty()
  resolutionNote: string;
}
