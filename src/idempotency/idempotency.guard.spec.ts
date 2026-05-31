import {
  BadRequestException,
  ExecutionContext,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyGuard } from './idempotency.guard';
import { IdempotencyService } from './idempotency.service';

type RequestWithIdempotency = {
  headers?: Record<string, string | undefined>;
  method?: string;
  url?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  requestHash?: string;
  idempotencyResponse?: { statusCode: number; body: unknown };
};

const createContext = (request: RequestWithIdempotency): ExecutionContext =>
  ({
    getHandler: () => undefined as never,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  }) as unknown as ExecutionContext;

describe('IdempotencyGuard', () => {
  const reflectorGetMock = jest.fn();
  const hashRequestMock = jest.fn();
  const findByKeyMock = jest.fn();
  const reflector = {
    get: reflectorGetMock,
  } as unknown as Reflector;
  const idempotencyService = {
    hashRequest: hashRequestMock,
    findByKey: findByKeyMock,
  } as unknown as IdempotencyService;
  const guard = new IdempotencyGuard(reflector, idempotencyService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows non-idempotent handlers through', async () => {
    reflectorGetMock.mockReturnValue(false);

    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(hashRequestMock).not.toHaveBeenCalled();
  });

  it('requires the idempotency key header', async () => {
    reflectorGetMock.mockReturnValue(true);

    await expect(
      guard.canActivate(createContext({ headers: {} })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects short idempotency keys', async () => {
    reflectorGetMock.mockReturnValue(true);

    await expect(
      guard.canActivate(
        createContext({
          headers: { 'idempotency-key': 'too-short' },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects reused keys with different request payloads', async () => {
    reflectorGetMock.mockReturnValue(true);
    hashRequestMock.mockReturnValue('current-hash');
    findByKeyMock.mockResolvedValue({
      requestHash: 'old-hash',
    });

    await expect(
      guard.canActivate(
        createContext({
          headers: { 'idempotency-key': '1234567890abcdef' },
          method: 'POST',
          url: '/wallets',
          body: {},
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('hydrates the request with cached response metadata', async () => {
    reflectorGetMock.mockReturnValue(true);
    hashRequestMock.mockReturnValue('current-hash');
    findByKeyMock.mockResolvedValue({
      requestHash: 'current-hash',
      statusCode: 201,
      response: { ok: true },
    });
    const request: RequestWithIdempotency = {
      headers: { 'idempotency-key': '1234567890abcdef' },
      method: 'POST',
      url: '/wallets',
      body: { amount: 10 },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.idempotencyKey).toBe('1234567890abcdef');
    expect(request.requestHash).toBe('current-hash');
    expect(request.idempotencyResponse).toEqual({
      statusCode: 201,
      body: { ok: true },
    });
  });
});
