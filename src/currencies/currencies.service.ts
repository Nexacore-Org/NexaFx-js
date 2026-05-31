import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
}

const CURRENCY_METADATA: Record<string, SupportedCurrency> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€' },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£' },
  NGN: { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
};

@Injectable()
export class CurrenciesService {
  constructor(private readonly config: ConfigService) {}

  listSupportedCurrencies(): SupportedCurrency[] {
    const supported = this.config.get<string[]>('currencies.supported') ?? [
      'USD',
      'EUR',
      'GBP',
      'NGN',
    ];

    return supported.map((code) => {
      const normalizedCode = code.toUpperCase();
      return (
        CURRENCY_METADATA[normalizedCode] ?? {
          code: normalizedCode,
          name: normalizedCode,
          symbol: normalizedCode,
        }
      );
    });
  }
}
