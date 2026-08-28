import { IsArray, IsNumber, IsString, Min, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkPaymentItemDto {
  @IsString()
  recipientAddress: string;

  @IsNumber()
  @Min(0.01, { message: 'Payment amount must be greater than zero' })
  amount: number;
}

export class CreateBulkPaymentDto {
  @IsArray()
  @ArrayMaxSize(100, { message: 'Maximum 100 items per bulk payment batch' })
  @ValidateNested({ each: true })
  @Type(() => BulkPaymentItemDto)
  items: BulkPaymentItemDto[];
}
