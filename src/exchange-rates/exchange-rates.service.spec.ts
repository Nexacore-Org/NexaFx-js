import { ExchangeRatesService } from './exchange-rates.service';
import { RatesGateway } from '../rates/rates.gateway';

describe('ExchangeRatesService rate broadcasting', () => {
  const makeRepos = () => {
    const cacheRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((entity) => entity),
      save: jest.fn(async (entity) => entity),
      count: jest.fn().mockResolvedValue(1),
    };
    const historyRepo = {
      create: jest.fn((entity) => entity),
      save: jest.fn(async (entity) => entity),
    };
    return { cacheRepo, historyRepo };
  };

  const makeGateway = () =>
    ({
      broadcastRateUpdate: jest.fn(),
      seedCurrentRates: jest.fn(),
    }) as unknown as jest.Mocked<RatesGateway>;

  it('broadcasts every refreshed pair when the cron refreshes expired rates', async () => {
    const { cacheRepo, historyRepo } = makeRepos();
    const gateway = makeGateway();
    const service = new ExchangeRatesService(
      cacheRepo as any,
      historyRepo as any,
      gateway,
    );

    await service.refreshExpiredRates();

    expect(gateway.broadcastRateUpdate).toHaveBeenCalled();

    const broadcastPairs = gateway.broadcastRateUpdate.mock.calls.map(
      ([pair]) => pair,
    );
    expect(broadcastPairs).toEqual([
      'USD/NGN',
      'USD/EUR',
      'USD/GBP',
      'EUR/NGN',
      'GBP/NGN',
    ]);

    for (const [, rate] of gateway.broadcastRateUpdate.mock.calls) {
      expect(typeof rate).toBe('number');
      expect(rate).toBeGreaterThan(0);
    }
  });

  it('does not broadcast when no cached rate has expired', async () => {
    const { cacheRepo, historyRepo } = makeRepos();
    cacheRepo.count.mockResolvedValue(0);
    const gateway = makeGateway();
    const service = new ExchangeRatesService(
      cacheRepo as any,
      historyRepo as any,
      gateway,
    );

    await service.refreshExpiredRates();

    expect(gateway.broadcastRateUpdate).not.toHaveBeenCalled();
  });

  it('seeds the gateway snapshot on startup so new clients see real rates', async () => {
    const { cacheRepo, historyRepo } = makeRepos();
    cacheRepo.find.mockResolvedValue([
      { pair: 'USD/NGN', rate: '1550.00000000' },
      { pair: 'USD/EUR', rate: '0.92000000' },
    ]);
    const gateway = makeGateway();
    const service = new ExchangeRatesService(
      cacheRepo as any,
      historyRepo as any,
      gateway,
    );

    await service.onModuleInit();

    expect(gateway.seedCurrentRates).toHaveBeenCalledWith([
      { currencyPair: 'USD/NGN', rate: 1550 },
      { currencyPair: 'USD/EUR', rate: 0.92 },
    ]);
  });

  it('logs and continues when the startup seed cannot read rates', async () => {
    const { cacheRepo, historyRepo } = makeRepos();
    cacheRepo.find.mockRejectedValue(new Error('database unavailable'));
    const gateway = makeGateway();
    const service = new ExchangeRatesService(
      cacheRepo as any,
      historyRepo as any,
      gateway,
    );

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(gateway.seedCurrentRates).not.toHaveBeenCalled();
  });
});
