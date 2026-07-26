import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, Min, Max, IsOptional, IsBoolean } from 'class-validator';

export class UpsertCurrencyPairDto {
  @ApiProperty({ example: 'XLM' })
  @IsString()
  fromCurrency: string;

  @ApiProperty({ example: 'NGN' })
  @IsString()
  toCurrency: string;

  @ApiProperty({ example: 2.5 })
  @IsNumber()
  @Min(0)
  @Max(5)
  spreadPercent: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
