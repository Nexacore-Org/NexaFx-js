import { IsNumber, IsString, IsUUID, Length, Matches } from 'class-validator';
import { IsNotZero } from '../../common/validators/is-not-zero.decorator';

export class AdjustBalanceDto {
  @IsUUID()
  accountId!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsNumber()
  @IsNotZero()
  delta!: number;
}
