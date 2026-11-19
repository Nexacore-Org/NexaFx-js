import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmDepositDto {
  @ApiPropertyOptional({
    description: 'Stellar transaction hash to attach to the deposit',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  txHash?: string;
}
