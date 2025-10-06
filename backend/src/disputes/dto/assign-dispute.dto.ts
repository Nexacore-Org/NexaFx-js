import { IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignDisputeDto {
  @ApiProperty({ description: 'Agent ID to assign dispute to' })
  @IsUUID()
  agentId: string;

  @ApiPropertyOptional({ description: 'Assignment notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
