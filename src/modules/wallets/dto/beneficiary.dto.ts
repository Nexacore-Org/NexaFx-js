import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBeneficiaryDto {
  @ApiProperty({ example: '0xRecipientAddress' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 'Alice' })
  @IsString()
  @IsNotEmpty()
  alias: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateBeneficiaryDto {
  @ApiPropertyOptional({ example: 'Alice Updated' })
  @IsOptional()
  @IsString()
  alias?: string;

  @ApiPropertyOptional({ example: '0xNewAddress' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
