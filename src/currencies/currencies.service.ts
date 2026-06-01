import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  normalizeCurrencyCode,
  SUPPORTED_CURRENCY_CODES,
} from './supported-currencies';

export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
}

const CURRENCY_METADATA: Record<string, SupportedCurrency> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$' },
  EUR: { code: 'EUR', name: 'Euro', symbol: 'EUR' },
  GBP: { code: 'GBP', name: 'British Pound', symbol: 'GBP' },
  NGN: { code: 'NGN', name: 'Nigerian Naira', symbol: 'NGN' },
};

@Injectable()
export class CurrenciesService {
  constructor(private readonly config: ConfigService) {}

  listSupportedCurrencies(): SupportedCurrency[] {
    const supported =
      this.config.get<string[]>('currencies.supported') ??
      [...SUPPORTED_CURRENCY_CODES];

    return supported.map((code) => {
      const normalizedCode = normalizeCurrencyCode(code);
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
