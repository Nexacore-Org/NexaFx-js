import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalDecision } from '../entities/transaction-approval.entity';

export class ApproveTransactionDto {
  @ApiPropertyOptional({ description: 'Optional comment for the approval' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class RejectTransactionDto {
  @ApiPropertyOptional({ description: 'Reason for rejection' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class ApprovalResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  transactionId: string;

  @ApiProperty()
  approverId: string;

  @ApiProperty({ enum: ApprovalDecision })
  decision: ApprovalDecision;

  @ApiPropertyOptional()
  comment?: string;

  @ApiProperty()
  timestamp: Date;

  @ApiProperty()
  transactionStatus: string;

  @ApiProperty()
  currentApprovals: number;

  @ApiProperty()
  requiredApprovals: number;
}
