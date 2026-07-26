import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkPaymentItemDto {
  @IsString()
  recipientAddress: string;

  @IsNumber()
  amount: number;
}

export class CreateBulkPaymentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkPaymentItemDto)
  items: BulkPaymentItemDto[];

  @IsString()
  currency: string;
}
