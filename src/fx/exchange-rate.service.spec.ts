import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { ExchangeRateService } from './exchange-rate.service';

const makeHttp = (rate?: number, fail = false) => ({
  get: jest.fn(() =>
    fail
      ? throwError(() => new Error('network error'))
      : of({ data: { rates: { USD: rate }, quotes: { EURUSD: rate } } }),
  ),
}) as unknown as HttpService;

const makeConfig = (ttl = 60) =>
  ({ get: jest.fn((k: string) => (k === 'cache.exchangeRateTtlSeconds' ? ttl : undefined)) } as unknown as ConfigService);

describe('ExchangeRateService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns cached rate without calling provider (cache hit)', async () => {
    const http = makeHttp(1.1);
    const svc = new ExchangeRateService(makeConfig(), http);

    await svc.getRate('EUR', 'USD'); // prime cache
    (http.get as jest.Mock).mockClear();
    await svc.getRate('EUR', 'USD'); // should use cache

    expect(http.get).not.toHaveBeenCalled();
  });

  it('calls provider and caches result on cache miss', async () => {
    const http = makeHttp(1.2);
    const svc = new ExchangeRateService(makeConfig(), http);

    const result = await svc.getRate('EUR', 'USD');

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(result.rate).toBe(1.2);
    expect(result.provider).toBe('openexchangerates');
  });

  it('falls back to second provider when primary fails', async () => {
    const http = {
      get: jest
        .fn()
        .mockImplementationOnce(() => throwError(() => new Error('primary down')))
        .mockImplementationOnce(() =>
          of({ data: { quotes: { EURUSD: 1.3 } } }),
        ),
    } as unknown as HttpService;

    const svc = new ExchangeRateService(makeConfig(), http);
    const result = await svc.getRate('EUR', 'USD');

    expect(result.rate).toBe(1.3);
    expect(result.provider).toBe('exchangeratehost');
  });

  it('throws ServiceUnavailableException when both providers fail', async () => {
    const http = makeHttp(undefined, true);
    const svc = new ExchangeRateService(makeConfig(), http);

    await expect(svc.getRate('EUR', 'USD')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('re-fetches after TTL expires (stale cache evicted)', async () => {
    const http = makeHttp(1.5);
    const svc = new ExchangeRateService(makeConfig(1), http); // 1 second TTL

    await svc.getRate('EUR', 'USD');
    jest.advanceTimersByTime(2000); // expire the cache
    (http.get as jest.Mock).mockClear();
    await svc.getRate('EUR', 'USD');

    expect(http.get).toHaveBeenCalledTimes(1);
  });
});
