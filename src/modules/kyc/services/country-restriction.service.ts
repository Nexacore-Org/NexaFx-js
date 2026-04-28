import {
  Injectable,
  Logger,
  ForbiddenException,
} from '@nestjs/common';

export type KycLevel = 'NONE' | 'BASIC' | 'ADVANCED';

export interface CountryRule {
  countryCode: string;
  restricted: boolean;
  maxTransactionLimit?: number;
  requiredKycLevel?: KycLevel;
  reason?: string;
}

const KYC_LEVEL_RANK: Record<KycLevel, number> = {
  NONE: 0,
  BASIC: 1,
  ADVANCED: 2,
};

@Injectable()
export class CountryRestrictionService {
  private readonly logger = new Logger(CountryRestrictionService.name);

  private readonly rules = new Map<string, CountryRule>([
    ['IR', { countryCode: 'IR', restricted: true, reason: 'Sanctioned jurisdiction' }],
    ['KP', { countryCode: 'KP', restricted: true, reason: 'Sanctioned jurisdiction' }],
    ['CU', { countryCode: 'CU', restricted: true, reason: 'Sanctioned jurisdiction' }],
    ['NG', { countryCode: 'NG', restricted: false, maxTransactionLimit: 5000, requiredKycLevel: 'BASIC' }],
    ['US', { countryCode: 'US', restricted: false, maxTransactionLimit: 10000, requiredKycLevel: 'ADVANCED' }],
    ['GB', { countryCode: 'GB', restricted: false, maxTransactionLimit: 10000, requiredKycLevel: 'BASIC' }],
  ]);

  upsertRule(rule: CountryRule): CountryRule {
    this.rules.set(rule.countryCode.toUpperCase(), rule);
    this.logger.log(`Country rule updated: ${rule.countryCode}`);
    return rule;
  }

  getRule(countryCode: string): CountryRule | undefined {
    return this.rules.get(countryCode.toUpperCase());
  }

  listRules(): CountryRule[] {
    return Array.from(this.rules.values());
  }

  assertTransactionAllowed(
    countryCode: string,
    amount: number,
    userKycLevel: KycLevel,
  ): void {
    const rule = this.rules.get(countryCode.toUpperCase());
    if (!rule) return;

    if (rule.restricted) {
      throw new ForbiddenException(
        `Transactions from country ${countryCode} are restricted: ${rule.reason ?? 'policy'}`,
      );
    }

    if (rule.maxTransactionLimit !== undefined && amount > rule.maxTransactionLimit) {
      throw new ForbiddenException(
        `Transaction amount ${amount} exceeds the limit of ${rule.maxTransactionLimit} for country ${countryCode}`,
      );
    }

    if (rule.requiredKycLevel) {
      const required = KYC_LEVEL_RANK[rule.requiredKycLevel];
      const actual = KYC_LEVEL_RANK[userKycLevel];
      if (actual < required) {
        throw new ForbiddenException(
          `Country ${countryCode} requires ${rule.requiredKycLevel} KYC level; user has ${userKycLevel}`,
        );
      }
    }
  }
}
