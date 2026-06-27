import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  normalizeCurrencyCode,
  isSupportedCurrency,
  SUPPORTED_CURRENCY_CODES,
} from './supported-currencies';

export type CurrencyType = 'fiat' | 'crypto';

export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
  displayName: string;
  decimalPlaces: number;
  flagEmoji: string;
  type: CurrencyType;
}

const CURRENCY_METADATA: Record<string, SupportedCurrency> = {
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    displayName: 'US Dollar',
    decimalPlaces: 2,
    flagEmoji: '🇺🇸',
    type: 'fiat',
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    displayName: 'Euro',
    decimalPlaces: 2,
    flagEmoji: '🇪🇺',
    type: 'fiat',
  },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    displayName: 'British Pound Sterling',
    decimalPlaces: 2,
    flagEmoji: '🇬🇧',
    type: 'fiat',
  },
  NGN: {
    code: 'NGN',
    name: 'Nigerian Naira',
    symbol: '₦',
    displayName: 'Nigerian Naira',
    decimalPlaces: 2,
    flagEmoji: '🇳🇬',
    type: 'fiat',
  },
};

@Injectable()
export class CurrenciesService {
  constructor(private readonly config: ConfigService) {}

  validateCurrencyActive(code: string): void {
    const normalized = normalizeCurrencyCode(code);
    if (!isSupportedCurrency(normalized)) {
      throw new BadRequestException(`Currency ${code} is not supported`);
    }
  }

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
          displayName: normalizedCode,
          decimalPlaces: 2,
          flagEmoji: '',
          type: 'fiat' as CurrencyType,
        }
      );
    });
  }
}
