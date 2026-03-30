import { DataSource } from 'typeorm';
import { CountryRuleEntity } from '../../modules/kyc/entities/country-rule.entity';

export async function seedCountryRules(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(CountryRuleEntity);

  const rules: Partial<CountryRuleEntity>[] = [
    { countryCode: 'US', isRestricted: false, requiresAdvancedKyc: false, maxTransactionLimit: 10000, currency: 'USD' },
    { countryCode: 'GB', isRestricted: false, requiresAdvancedKyc: false, maxTransactionLimit: 10000, currency: 'GBP' },
    { countryCode: 'EU', isRestricted: false, requiresAdvancedKyc: false, maxTransactionLimit: 10000, currency: 'EUR' },
    { countryCode: 'NG', isRestricted: false, requiresAdvancedKyc: true, maxTransactionLimit: 5000, currency: 'NGN' },
    { countryCode: 'GH', isRestricted: false, requiresAdvancedKyc: true, maxTransactionLimit: 5000, currency: 'GHS' },
    { countryCode: 'KE', isRestricted: false, requiresAdvancedKyc: false, maxTransactionLimit: 5000, currency: 'KES' },
    { countryCode: 'ZA', isRestricted: false, requiresAdvancedKyc: false, maxTransactionLimit: 8000, currency: 'ZAR' },
    { countryCode: 'IR', isRestricted: true, requiresAdvancedKyc: true, currency: 'IRR' },
    { countryCode: 'KP', isRestricted: true, requiresAdvancedKyc: true, currency: 'KPW' },
    { countryCode: 'SY', isRestricted: true, requiresAdvancedKyc: true, currency: 'SYP' },
    { countryCode: 'CU', isRestricted: true, requiresAdvancedKyc: true, currency: 'CUP' },
  ];

  for (const rule of rules) {
    const existing = await repo.findOne({ where: { countryCode: rule.countryCode } });
    if (!existing) {
      await repo.save(repo.create(rule));
    }
  }
}
