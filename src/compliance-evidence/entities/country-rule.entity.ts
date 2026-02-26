export class CountryRule {
  countryCode: string; // e.g., 'US', 'GB', 'AE'
  maxTransactionLimit: number;
  restrictedAssets: string[];
  requiresAdvancedKyc: boolean;
  isEnabled: boolean;
}