import { IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

export class QuoteDto {
  @IsString() @IsNotEmpty() userId: string;
  @IsString() @IsNotEmpty() fromCurrency: string;
  @IsString() @IsNotEmpty() toCurrency: string;
  @IsNumberString() fromAmount: string;
}

export class ExecuteDto {
  @IsString() @IsNotEmpty() quoteId: string;
}


