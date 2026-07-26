import { IsEnum, IsNumber, IsString, Length, Min } from 'class-validator';

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  SWAP = 'swap',
}

export class FeePreviewDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsEnum(TransactionType)
  type: TransactionType;
}
