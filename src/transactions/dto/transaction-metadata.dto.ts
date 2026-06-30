import { ApiPropertyOptional } from '@nestjs/swagger';

export class DepositMetadataDto {
  @ApiPropertyOptional()
  type?: string;
}

export class SwapMetadataDto {
  @ApiPropertyOptional()
  type?: string;

  @ApiPropertyOptional()
  toAmount?: number;

  @ApiPropertyOptional()
  toCurrency?: string;
}

export class WithdrawalMetadataDto {
  @ApiPropertyOptional()
  type?: string;
}
