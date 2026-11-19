import { IsNotEmpty, IsString } from 'class-validator';
import { IsStellarAddress } from '../../../common/validators/is-stellar-address.decorator';

/**
 * Body of `POST /admin/dev/fund-wallet`. Needs real validators: the global
 * ValidationPipe uses `whitelist` + `forbidNonWhitelisted`, so a property without
 * a decorator is rejected and the endpoint could never be called (issue #1521).
 */
export class FundWalletDto {
  @IsString()
  @IsNotEmpty()
  @IsStellarAddress()
  address!: string;
}
