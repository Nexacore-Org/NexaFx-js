import { ConfigService } from '@nestjs/config';
import { CurrenciesService } from './currencies.service';

describe('CurrenciesService', () => {
  it('returns supported currencies in uppercase', () => {
    const config = {
      get: jest.fn().mockReturnValue(['usd', 'eur']),
    } as unknown as ConfigService;
    const service = new CurrenciesService(config);

    expect(service.listSupportedCurrencies()).toEqual([
      { code: 'USD', name: 'US Dollar', symbol: '$' },
      { code: 'EUR', name: 'Euro', symbol: 'EUR' },
    ]);
  });
});
