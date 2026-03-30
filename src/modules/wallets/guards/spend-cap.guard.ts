import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { WalletBalanceService } from '../services/wallet-balance.service';

/**
 * Enforces per-wallet spend cap on transaction creation.
 * Expects request.body to contain { walletId, amount }.
 * Expects wallet metadata.spendCap to define the maximum allowed balance deduction.
 */
@Injectable()
export class SpendCapGuard implements CanActivate {
  constructor(private readonly walletBalanceService: WalletBalanceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { walletId, amount } = request.body ?? {};

    if (!walletId || amount == null) return true; // Not a wallet debit — skip

    const balance = await this.walletBalanceService.getBalance(walletId);

    if (Number(amount) > balance.available) {
      throw new ForbiddenException(
        `Transaction amount ${amount} exceeds available balance ${balance.available}`,
      );
    }

    return true;
  }
}
