import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

type RequestWithReplay = {
  idempotencyResponse?: { statusCode: number; body: unknown };
  idempotencyKey?: string;
  requestHash?: string;
};

const createContext = (
  request: RequestWithReplay,
  response: { status?: jest.Mock; statusCode: number },
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  }) as unknown as ExecutionContext;

describe('IdempotencyInterceptor', () => {
  const storeMock = jest.fn();
  const idempotencyService = {
    store: storeMock,
  } as unknown as IdempotencyService;
  const interceptor = new IdempotencyInterceptor(idempotencyService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a cached response immediately when present', async () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      statusCode: 200,
    };
    const request = {
      idempotencyResponse: {
        statusCode: 202,
        body: { ok: true },
      },
    };
    const handleMock = jest.fn();
    const next: Pick<CallHandler, 'handle'> = {
      handle: handleMock,
    };

    await expect(
      lastValueFrom(
        interceptor.intercept(createContext(request, response), next),
      ),
    ).resolves.toEqual({ ok: true });

    expect(response.status).toHaveBeenCalledWith(202);
    expect(handleMock).not.toHaveBeenCalled();
  });

  it('stores successful responses for future replay', async () => {
    const response = {
      statusCode: 204,
    };
    const request = {
      idempotencyKey: '1234567890abcdef',
      requestHash: 'hash',
    };
    const handleMock = jest.fn(() => of({ ok: true }));
    const next: Pick<CallHandler, 'handle'> = {
      handle: handleMock,
    };

    await expect(
      lastValueFrom(
        interceptor.intercept(createContext(request, response), next),
      ),
    ).resolves.toEqual({ ok: true });

    expect(storeMock).toHaveBeenCalledWith(
      '1234567890abcdef',
      'hash',
      { ok: true },
      204,
    );
  });
});
