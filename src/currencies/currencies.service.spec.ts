import { ConfigService } from '@nestjs/config';
import { CurrenciesService } from './currencies.service';

describe('CurrenciesService', () => {
  it('returns supported currencies with all display fields', () => {
    const config = {
      get: jest.fn().mockReturnValue(['usd', 'eur']),
    } as unknown as ConfigService;
    const service = new CurrenciesService(config);

    expect(service.listSupportedCurrencies()).toEqual([
      {
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        displayName: 'US Dollar',
        decimalPlaces: 2,
        flagEmoji: '🇺🇸',
        type: 'fiat',
      },
      {
        code: 'EUR',
        name: 'Euro',
        symbol: '€',
        displayName: 'Euro',
        decimalPlaces: 2,
        flagEmoji: '🇪🇺',
        type: 'fiat',
      },
    ]);
  });

  it('falls back gracefully for unknown currency codes', () => {
    const config = {
      get: jest.fn().mockReturnValue(['XYZ']),
    } as unknown as ConfigService;
    const service = new CurrenciesService(config);

    expect(service.listSupportedCurrencies()).toEqual([
      {
        code: 'XYZ',
        name: 'XYZ',
        symbol: 'XYZ',
        displayName: 'XYZ',
        decimalPlaces: 2,
        flagEmoji: '',
        type: 'fiat',
      },
    ]);
  });
});
