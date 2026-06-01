import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';

describe('CurrenciesController', () => {
  it('returns the supported currency list', () => {
    const listSupportedCurrencies = jest.fn().mockReturnValue([
      { code: 'USD', name: 'US Dollar', symbol: '$' },
    ]);
    const controller = new CurrenciesController({
      listSupportedCurrencies,
    } as unknown as CurrenciesService);

    expect(controller.getSupportedCurrencies()).toEqual([
      { code: 'USD', name: 'US Dollar', symbol: '$' },
    ]);
    expect(listSupportedCurrencies).toHaveBeenCalledTimes(1);
  });
});
