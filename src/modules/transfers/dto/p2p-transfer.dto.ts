import { IsString, IsNumber, IsUUID, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class P2PTransferDto {
  @ApiProperty({
    description: 'Amount to transfer',
    example: 100.50,
  })
  @IsNumber()
  @Min(0.01)
  @Max(1000000) // Max transfer limit
  amount: number;

  @ApiProperty({
    description: 'Currency code (3-letter ISO)',
    example: 'USD',
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({
    description: 'Recipient wallet ID or user ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsUUID()
  recipientId: string;

  @ApiPropertyOptional({
    description: 'Transfer description/note',
    example: 'Payment for services',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Sender wallet ID (if not provided, uses default wallet)',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsString()
  @IsUUID()
  @IsOptional()
  senderWalletId?: string;
}

export class TransferReversalDto {
  @ApiPropertyOptional({
    description: 'Reason for reversal',
    example: 'Wrong recipient',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class TransferResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  senderId: string;

  @ApiProperty()
  recipientId: string;

  @ApiProperty()
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED';

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  completedAt?: Date;

  @ApiProperty()
  description?: string;

  @ApiProperty()
  senderTransactionId?: string;

  @ApiProperty()
  recipientTransactionId?: string;

  @ApiProperty()
  fee?: number;

  @ApiProperty()
  reversibleUntil: Date;
}
