import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { RateProviderService } from '../src/fx/services/rate-provider.service';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';

describe('RateProviderService (Integration)', () => {
  let service: RateProviderService;
  let httpService: HttpService;
  let redisMock: any;

  beforeEach(async () => {
    redisMock = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateProviderService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'OPEN_EXCHANGE_RATES_API_KEY') return 'test-oer-key';
              if (key === 'EXCHANGE_RATE_HOST_API_KEY') return 'test-erh-key';
              return null;
            }),
          },
        },
        {
          provide: getRedisConnectionToken(),
          useValue: redisMock,
        },
      ],
    }).compile();

    service = module.get<RateProviderService>(RateProviderService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should fetch rate from primary provider (Open Exchange Rates)', async () => {
    redisMock.get.mockResolvedValue(null);
    const mockResponse: AxiosResponse = {
      data: { rates: { EUR: 0.85 } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} as any },
    };
    jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

    const rate = await service.getMidRate('USD', 'EUR');

    expect(rate).toBe(0.85);
    expect(httpService.get).toHaveBeenCalledWith(
      expect.stringContaining('openexchangerates.org'),
      expect.any(Object),
    );
    expect(redisMock.setex).toHaveBeenCalledWith('fx:rate:USD_EUR', 30, '0.85');
  });

  it('should failover to Frankfurter if Open Exchange Rates fails', async () => {
    redisMock.get.mockResolvedValue(null);
    
    // First call fails
    jest.spyOn(httpService, 'get')
      .mockReturnValueOnce(throwError(() => new Error('OER Failed')))
      .mockReturnValueOnce(of({
        data: { rates: { EUR: 0.86 } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: {} as any },
      } as AxiosResponse));

    const rate = await service.getMidRate('USD', 'EUR');

    expect(rate).toBe(0.86);
    expect(httpService.get).toHaveBeenCalledTimes(2);
    expect(httpService.get).toHaveBeenNthCalledWith(1, expect.stringContaining('openexchangerates.org'), expect.any(Object));
    expect(httpService.get).toHaveBeenNthCalledWith(2, expect.stringContaining('api.frankfurter.app'), expect.any(Object));
  });

  it('should return cached rate if available', async () => {
    redisMock.get.mockResolvedValue('0.87');

    const rate = await service.getMidRate('USD', 'EUR');

    expect(rate).toBe(0.87);
    expect(httpService.get).not.toHaveBeenCalled();
  });

  it('should use stale cache if all providers fail', async () => {
    redisMock.get.mockResolvedValue(null); // No primary cache
    redisMock.get.mockImplementation((key) => {
      if (key === 'fx:rate:stale:USD_EUR') return Promise.resolve('0.88');
      return Promise.resolve(null);
    });

    jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => new Error('All Failed')));

    const rate = await service.getMidRate('USD', 'EUR');

    expect(rate).toBe(0.88);
  });

  it('should throw ServiceUnavailableException if all providers and stale cache fail', async () => {
    redisMock.get.mockResolvedValue(null);
    jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => new Error('All Failed')));

    await expect(service.getMidRate('USD', 'EUR')).rejects.toThrow(ServiceUnavailableException);
  });

  it('should trigger circuit breaker after multiple failures', async () => {
    redisMock.get.mockResolvedValue(null);
    jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => new Error('Fail')));

    // Fail 5 times (default threshold)
    for (let i = 0; i < 5; i++) {
      try { await service.getMidRate('USD', 'EUR'); } catch (e) {}
    }

    const status = await service.getProviderStatus();
    const oer = status.find(s => s.provider === 'openexchangerates');
    expect(oer.circuitBreakerState).toBe('OPEN');
  });
});
