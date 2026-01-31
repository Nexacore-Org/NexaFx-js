import {
  IsBoolean,
  IsString,
  IsOptional,
  IsArray,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMaintenanceDto {
  @ApiPropertyOptional({
    description: 'Custom maintenance message to display to users',
    example: 'System is undergoing scheduled maintenance. We will be back soon!',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'Estimated time when maintenance will be completed',
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  estimatedEndTime?: Date;

  @ApiPropertyOptional({
    description: 'Array of endpoint patterns to disable (supports wildcards)',
    example: ['/api/v1/users/*', '/api/v1/orders'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disabledEndpoints?: string[];

  @ApiPropertyOptional({
    description: 'Roles that can bypass maintenance mode',
    example: ['admin', 'superadmin'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bypassRoles?: string[];
}

export class EnableMaintenanceDto {
  @ApiProperty({
    description: 'Custom maintenance message',
    example: 'We are performing scheduled maintenance',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'Estimated end time of maintenance',
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  estimatedEndTime?: Date;

  @ApiPropertyOptional({
    description: 'Specific endpoints to disable',
    example: ['/api/v1/users/*'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disabledEndpoints?: string[];
}