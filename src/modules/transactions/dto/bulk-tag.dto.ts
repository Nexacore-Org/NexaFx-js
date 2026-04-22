import { IsString, IsNotEmpty, IsOptional, IsObject, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkTagDto {
  @ApiProperty({ 
    description: 'Tag to apply to matching transactions', 
    example: 'groceries',
    maxLength: 50 
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  tag: string;

  @ApiProperty({ 
    description: 'Filter criteria for transactions to tag', 
    example: { currency: 'USD', status: 'SUCCESS' } 
  })
  @IsObject()
  filter: Record<string, any>;

  @ApiProperty({ 
    description: 'Maximum number of transactions to tag', 
    example: 200,
    required: false 
  })
  @IsOptional()
  maxTransactions?: number = 200;
}
