import { IsString, IsNotEmpty, IsNumber, Min, Max, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertCurrencyPairDto {
  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  fromCurrency: string;

  @ApiProperty({ example: 'EUR' })
  @IsString()
  @IsNotEmpty()
  toCurrency: string;

  @ApiProperty({ example: 0.5, description: 'Spread percentage (0-5%)' })
  @IsNumber()
  @Min(0)
  @Max(5)
  spreadPercent: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
