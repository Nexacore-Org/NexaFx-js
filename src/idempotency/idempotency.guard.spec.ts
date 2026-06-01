import {
  BadRequestException,
  ExecutionContext,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyGuard } from './idempotency.guard';
import { IdempotencyService } from './idempotency.service';
import { IDEMPOTENCY_KEY } from './idempotency.decorator';
import { MAX_KEY_LENGTH } from './constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_KEY = 'a'.repeat(16); // exactly MIN_KEY_LENGTH
const HASH = 'abc123hash';

function makeContext(overrides: {
  headers?: Record<string, string>;
  body?: unknown;
  method?: string;
  url?: string;
}): ExecutionContext {
  const {
    headers = {},
    body = {},
    method = 'POST',
    url = '/transfers',
  } = overrides;

  const request: Record<string, unknown> = { headers, body, method, url };

  return {
    getHandler: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    // expose the request so tests can inspect mutations
    _request: request,
  } as unknown as ExecutionContext & { _request: Record<string, unknown> };
}

function makeReflector(isIdempotent: boolean): Reflector {
  return {
    get: jest.fn().mockReturnValue(isIdempotent),
  } as unknown as Reflector;
}

function makeService(existing: unknown = null): IdempotencyService {
  return {
    hashRequest: jest.fn().mockReturnValue(HASH),
    findByKey: jest.fn().mockResolvedValue(existing),
    store: jest.fn().mockResolvedValue(undefined),
  } as unknown as IdempotencyService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IdempotencyGuard', () => {
  describe('when route is NOT decorated with @Idempotent()', () => {
    it('bypasses all checks and returns true', async () => {
      const reflector = makeReflector(false);
      const service = makeService();
      const guard = new IdempotencyGuard(reflector, service);
      const ctx = makeContext({});

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(service.findByKey).not.toHaveBeenCalled();
    });
  });

  describe('when route IS decorated with @Idempotent()', () => {
    it('throws BadRequestException when Idempotency-Key header is missing', async () => {
      const guard = new IdempotencyGuard(makeReflector(true), makeService());
      const ctx = makeContext({ headers: {} }); // no idempotency-key

      await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Idempotency-Key header is required',
      );
    });

    it('throws BadRequestException when key is shorter than 16 characters', async () => {
      const guard = new IdempotencyGuard(makeReflector(true), makeService());
      const ctx = makeContext({
        headers: { 'idempotency-key': 'short' }, // only 5 chars
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'at least 16 characters',
      );
    });

    it('accepts a key of exactly 255 characters', async () => {
      const longKey = 'a'.repeat(MAX_KEY_LENGTH);
      const service = makeService(null);
      const guard = new IdempotencyGuard(makeReflector(true), service);
      const ctx = makeContext({
        headers: { 'idempotency-key': longKey },
      }) as ExecutionContext & { _request: Record<string, unknown> };

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(service.findByKey).toHaveBeenCalledWith(longKey);
      expect(ctx._request.idempotencyKey).toBe(longKey);
    });

    it('throws BadRequestException when key is longer than 255 characters', async () => {
      const longKey = 'a'.repeat(MAX_KEY_LENGTH + 1);
      const guard = new IdempotencyGuard(makeReflector(true), makeService());
      const ctx = makeContext({
        headers: { 'idempotency-key': longKey },
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        `Idempotency-Key must not exceed ${MAX_KEY_LENGTH} characters`,
      );
    });

    it('throws BadRequestException when key is extremely large', async () => {
      const longKey = 'a'.repeat(1024 * 1024);
      const guard = new IdempotencyGuard(makeReflector(true), makeService());
      const ctx = makeContext({
        headers: { 'idempotency-key': longKey },
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        `Idempotency-Key must not exceed ${MAX_KEY_LENGTH} characters`,
      );
    });

    it('returns true and attaches key/hash to request on first (fresh) request', async () => {
      const service = makeService(null); // no existing record
      const guard = new IdempotencyGuard(makeReflector(true), service);
      const ctx = makeContext({
        headers: { 'idempotency-key': VALID_KEY },
      }) as ExecutionContext & { _request: Record<string, unknown> };

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(service.findByKey).toHaveBeenCalledWith(VALID_KEY);
      // key and hash should be attached to the request for downstream use
      expect(ctx._request.idempotencyKey).toBe(VALID_KEY);
      expect(ctx._request.requestHash).toBe(HASH);
      // no cached response should be set
      expect(ctx._request.idempotencyResponse).toBeUndefined();
    });

    it('returns true and attaches cached response when duplicate request has the same hash', async () => {
      const cachedRecord = {
        key: VALID_KEY,
        requestHash: HASH, // same hash → duplicate of identical request
        statusCode: 201,
        response: { id: 'tx-1', amount: 100 },
      };
      const service = makeService(cachedRecord);
      const guard = new IdempotencyGuard(makeReflector(true), service);
      const ctx = makeContext({
        headers: { 'idempotency-key': VALID_KEY },
      }) as ExecutionContext & { _request: Record<string, unknown> };

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(ctx._request.idempotencyResponse).toEqual({
        statusCode: 201,
        body: { id: 'tx-1', amount: 100 },
      });
    });

    it('throws UnprocessableEntityException when duplicate key is used with a different request hash', async () => {
      const cachedRecord = {
        key: VALID_KEY,
        requestHash: 'completely-different-hash', // hash mismatch
        statusCode: 201,
        response: { id: 'tx-1' },
      };
      const service = makeService(cachedRecord);
      // hashRequest still returns HASH, which differs from the stored one
      const guard = new IdempotencyGuard(makeReflector(true), service);
      const ctx = makeContext({
        headers: { 'idempotency-key': VALID_KEY },
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Idempotency-Key already used with different request parameters',
      );
    });
  });

  describe('reflector integration', () => {
    it('reads the IDEMPOTENCY_KEY metadata from the handler', async () => {
      const reflector = makeReflector(false);
      const guard = new IdempotencyGuard(reflector, makeService());
      const ctx = makeContext({});

      await guard.canActivate(ctx);

      expect(reflector.get).toHaveBeenCalledWith(
        IDEMPOTENCY_KEY,
        ctx.getHandler(),
      );
    });
  });
});
