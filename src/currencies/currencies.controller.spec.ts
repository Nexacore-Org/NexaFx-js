import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';

describe('CurrenciesController', () => {
  it('returns the supported currency list with all display fields', () => {
    const mockCurrency = {
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      displayName: 'US Dollar',
      decimalPlaces: 2,
      flagEmoji: '🇺🇸',
      type: 'fiat' as const,
    };
    const listSupportedCurrencies = jest.fn().mockReturnValue([mockCurrency]);
    const controller = new CurrenciesController({
      listSupportedCurrencies,
    } as unknown as CurrenciesService);

    expect(controller.getSupportedCurrencies()).toEqual([mockCurrency]);
    expect(listSupportedCurrencies).toHaveBeenCalledTimes(1);
  });
});
