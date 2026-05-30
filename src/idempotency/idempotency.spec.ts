import { firstValueFrom, of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyGuard } from './idempotency.guard';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

interface MockRequest {
  headers: Record<string, string>;
  method: string;
  url: string;
  body: {
    amount: number;
    currency: string;
  };
  idempotencyKey?: string;
  requestHash?: string;
  idempotencyResponse?: {
    statusCode: number;
    body: {
      paymentId: string;
    };
  };
}

interface MockResponse {
  statusCode: number;
  status: jest.MockedFunction<(code: number) => MockResponse>;
}

describe('Idempotency replay flow', () => {
  const idempotencyKey = '1234567890abcdef';
  let request: MockRequest;
  let response: MockResponse;
  let context: ExecutionContext;

  beforeEach(() => {
    request = {
      headers: {
        'idempotency-key': idempotencyKey,
      },
      method: 'POST',
      url: '/api/v1/payments',
      body: {
        amount: 250,
        currency: 'USD',
      },
    };

    response = {
      statusCode: 201,
      status: jest.fn((code: number) => {
        response.statusCode = code;
        return response;
      }),
    };

    context = {
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  });

  it('hydrates the cached response on a duplicate key', async () => {
    const existingRecord = {
      key: idempotencyKey,
      requestHash: 'request-hash',
      response: {
        paymentId: 'pay_123',
      },
      statusCode: 202,
    };

    const reflector = {
      get: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;

    const idempotencyService = {
      hashRequest: jest.fn().mockReturnValue('request-hash'),
      findByKey: jest.fn().mockResolvedValue(existingRecord),
    } as unknown as IdempotencyService;

    const guard = new IdempotencyGuard(reflector, idempotencyService);

    await guard.canActivate(context);

    expect(request.idempotencyResponse).toEqual({
      statusCode: 202,
      body: existingRecord.response,
    });
    expect(request.idempotencyKey).toBe(idempotencyKey);
    expect(request.requestHash).toBe('request-hash');
  });

  it('replays a cached response without calling the handler again', async () => {
    request.idempotencyResponse = {
      statusCode: 202,
      body: {
        paymentId: 'pay_123',
      },
    };

    const idempotencyService = {
      store: jest.fn(),
    } as unknown as IdempotencyService;

    const interceptor = new IdempotencyInterceptor(idempotencyService);
    const next: CallHandler = {
      handle: jest.fn(),
    } as unknown as CallHandler;

    await expect(
      firstValueFrom(interceptor.intercept(context, next)),
    ).resolves.toEqual({
      paymentId: 'pay_123',
    });

    expect(response.status.mock.calls).toEqual([[202]]);
    expect((next.handle as jest.Mock).mock.calls).toHaveLength(0);
    expect((idempotencyService.store as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('stores the response after a successful new request', async () => {
    request.idempotencyKey = idempotencyKey;
    request.requestHash = 'request-hash';

    const idempotencyService = {
      store: jest.fn().mockResolvedValue(undefined),
    } as unknown as IdempotencyService;

    const interceptor = new IdempotencyInterceptor(idempotencyService);
    const next: CallHandler = {
      handle: jest.fn().mockReturnValue(of({ paymentId: 'pay_456' })),
    } as unknown as CallHandler;

    await expect(
      firstValueFrom(interceptor.intercept(context, next)),
    ).resolves.toEqual({
      paymentId: 'pay_456',
    });

    expect((idempotencyService.store as jest.Mock).mock.calls).toEqual([
      [
        idempotencyKey,
        'request-hash',
        {
          paymentId: 'pay_456',
        },
        201,
      ],
    ]);
  });
});
