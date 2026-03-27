import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupportMessageDto {
  @ApiProperty({ example: 'Here is the additional information you requested' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: 'Internal note visible to admins only', default: false })
  @IsBoolean()
  @IsOptional()
  isInternal?: boolean;
}
