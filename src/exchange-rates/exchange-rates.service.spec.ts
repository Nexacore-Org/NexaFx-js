import { ExchangeRateService } from '../fx/exchange-rate.service';
import { ExchangeRatesService } from './exchange-rates.service';
import { RatesGateway } from '../rates/rates.gateway';

const EXPECTED_PAIRS = [
  'USD/NGN',
  'USD/EUR',
  'USD/GBP',
  'EUR/NGN',
  'GBP/NGN',
] as const;

const RATES: Record<string, number> = {
  'USD/NGN': 1444.12345678,
  'USD/EUR': 0.91234567,
  'USD/GBP': 0.78912345,
  'EUR/NGN': 1733.45678901,
  'GBP/NGN': 1999.87654321,
};

describe('ExchangeRatesService rate broadcasting', () => {
  const makeRepos = () => {
    const cacheRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((entity: object) => entity),
      save: jest.fn((entity: object) => Promise.resolve(entity)),
      count: jest.fn().mockResolvedValue(1),
    };
    const historyRepo = {
      create: jest.fn((entity: object) => entity),
      save: jest.fn((entity: object) => Promise.resolve(entity)),
    };
    return { cacheRepo, historyRepo };
  };

  const makeGateway = () => {
    const broadcastRateUpdate = jest.fn<(pair: string, rate: number) => void>();
    const seedCurrentRates =
      jest.fn<(rates: Array<{ currencyPair: string; rate: number }>) => void>();
    const gateway = {
      broadcastRateUpdate,
      seedCurrentRates,
    } as unknown as jest.Mocked<RatesGateway>;
    return { gateway, broadcastRateUpdate, seedCurrentRates };
  };

  const makeFxRateService = () => {
    const getRate = jest.fn((base: string, target: string) =>
      Promise.resolve({
        base,
        target,
        rate: RATES[`${base}/${target}`] ?? 0,
        provider: 'test-provider',
        fetchedAt: new Date(),
        ageMs: 0,
      }),
    );

    return {
      fxRateService: { getRate } as unknown as ExchangeRateService,
      getRate,
    };
  };

  it('broadcasts provider rates for every refreshed pair', async () => {
    const { cacheRepo, historyRepo } = makeRepos();
    const { gateway, broadcastRateUpdate } = makeGateway();
    const { fxRateService, getRate } = makeFxRateService();
    const service = new ExchangeRatesService(
      cacheRepo as any,
      historyRepo as any,
      gateway,
      fxRateService,
    );

    await service.refreshExpiredRates();

    expect(getRate.mock.calls).toEqual([
      ['USD', 'NGN'],
      ['USD', 'EUR'],
      ['USD', 'GBP'],
      ['EUR', 'NGN'],
      ['GBP', 'NGN'],
    ]);
    expect(broadcastRateUpdate.mock.calls).toEqual(
      EXPECTED_PAIRS.map((pair) => [pair, RATES[pair] ?? 0]),
    );
  });

  it('does not broadcast or call the provider when no cached rate has expired', async () => {
    const { cacheRepo, historyRepo } = makeRepos();
    cacheRepo.count.mockResolvedValue(0);
    const { gateway, broadcastRateUpdate } = makeGateway();
    const { fxRateService, getRate } = makeFxRateService();
    const service = new ExchangeRatesService(
      cacheRepo as any,
      historyRepo as any,
      gateway,
      fxRateService,
    );

    await service.refreshExpiredRates();

    expect(broadcastRateUpdate).not.toHaveBeenCalled();
    expect(getRate).not.toHaveBeenCalled();
  });

  it('seeds the gateway snapshot on startup so new clients see real rates', async () => {
    const { cacheRepo, historyRepo } = makeRepos();
    cacheRepo.find.mockResolvedValue([
      { pair: 'USD/NGN', rate: '1550.00000000' },
      { pair: 'USD/EUR', rate: '0.92000000' },
    ]);
    const { gateway, seedCurrentRates } = makeGateway();
    const { fxRateService } = makeFxRateService();
    const service = new ExchangeRatesService(
      cacheRepo as any,
      historyRepo as any,
      gateway,
      fxRateService,
    );

    await service.onModuleInit();

    expect(seedCurrentRates).toHaveBeenCalledWith([
      { currencyPair: 'USD/NGN', rate: 1550 },
      { currencyPair: 'USD/EUR', rate: 0.92 },
    ]);
  });

  it('logs and continues when the startup seed cannot read rates', async () => {
    const { cacheRepo, historyRepo } = makeRepos();
    cacheRepo.find.mockRejectedValue(new Error('database unavailable'));
    const { gateway, seedCurrentRates } = makeGateway();
    const { fxRateService } = makeFxRateService();
    const service = new ExchangeRatesService(
      cacheRepo as any,
      historyRepo as any,
      gateway,
      fxRateService,
    );

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(seedCurrentRates).not.toHaveBeenCalled();
  });
});
