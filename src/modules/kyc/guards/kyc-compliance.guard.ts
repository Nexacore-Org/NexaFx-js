import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { KycService } from '../services/kyc.service';

/**
 * Enforces KYC requirements and country-level restrictions on transaction creation.
 * Expects request.body to contain { countryCode?, amount?, currency? }.
 * Expects request.user to contain { id }.
 */
@Injectable()
export class KycComplianceGuard implements CanActivate {
  constructor(private readonly kycService: KycService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id ?? request.user?.sub;
    const { countryCode, amount } = request.body ?? {};

    if (!userId) return true;

    if (countryCode) {
      const rule = await this.kycService.getCountryRule(countryCode);

      if (rule?.isRestricted) {
        throw new ForbiddenException(`Transactions are restricted for country: ${countryCode}`);
      }

      if (rule?.maxTransactionLimit && amount != null && Number(amount) > Number(rule.maxTransactionLimit)) {
        throw new ForbiddenException(
          `Transaction amount exceeds country limit of ${rule.maxTransactionLimit}`,
        );
      }

      if (rule?.requiresAdvancedKyc) {
        const { level } = await this.kycService.getStatus(userId);
        if (level !== 'ADVANCED') {
          throw new ForbiddenException('Advanced KYC verification required for this country');
        }
      }
    }

    return true;
  }
}
