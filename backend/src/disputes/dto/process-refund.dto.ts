import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class ProcessRefundDto {
  @ApiProperty({
    description:
      'Refund amount in NGN (if not provided, dispute refund amount will be used)',
    example: '5000.00',
    required: false,
  })
  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount?: string;

  @ApiProperty({
    description: 'Reason for the refund',
    example: 'Dispute resolved in favor of customer',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RefundResponseDto {
  @ApiProperty({
    description: 'Response message',
    example: 'Refund processing initiated',
  })
  message: string;

  @ApiProperty({
    description: 'Dispute ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  disputeId: string;

  @ApiProperty({
    description: 'Background job ID for tracking refund processing',
    example: '12345',
    required: false,
  })
  jobId?: string;
}
