import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { BeneficiaryService } from '../wallets/services/beneficiary.service';

/**
 * Warns users when sending to an address not in their beneficiary list.
 * Returns 202 with a warning. The client must re-send with
 * `X-Confirm-First-Send: true` header to proceed.
 */
@Injectable()
export class BeneficiaryWarningGuard implements CanActivate {
  constructor(private readonly beneficiaryService: BeneficiaryService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string = request.user?.id ?? request.user?.sub;
    const toAddress: string | undefined = request.body?.toAddress;

    if (!userId || !toAddress) return true;

    const confirmed = request.headers['x-confirm-first-send'] === 'true';
    if (confirmed) return true;

    const isBeneficiary = await this.beneficiaryService.isBeneficiary(userId, toAddress);
    if (isBeneficiary) return true;

    throw new HttpException(
      {
        statusCode: HttpStatus.ACCEPTED,
        warning: 'FIRST_SEND_WARNING',
        message: `Address ${toAddress} is not in your beneficiary list. Re-send with header X-Confirm-First-Send: true to proceed.`,
      },
      HttpStatus.ACCEPTED,
    );
  }
}
