import { BadRequestException } from '@nestjs/common';
import { FxQuoteCache, MemoryFxQuoteStore, RedisFxQuoteStore, FxQuote } from './fx-quote-cache';
import { FxService } from './fx.service';

const base = { userId: 'u1', fromCurrency: 'EUR', toCurrency: 'USD', fromAmount: 100, rate: 1.08 };
const request = { userId: 'u1', fromCurrency: 'EUR', toCurrency: 'USD', fromAmount: 100 };

beforeEach(async () => {
  FxQuoteCache.use(new MemoryFxQuoteStore());
});

describe('FxQuoteCache (#1377)', () => {
  it('issues unguessable UUID-based ids', async () => {
    const { quoteId } = await FxQuoteCache.create(base);
    expect(quoteId).toMatch(/^q_[0-9a-f-]{36}$/);
  });

  it('redeems a valid quote once and returns its locked rate', async () => {
    const { quoteId } = await FxQuoteCache.create(base);
    await expect(FxQuoteCache.redeem(quoteId, request)).resolves.toMatchObject({ rate: 1.08 });
  });

  it('rejects a second redemption', async () => {
    const { quoteId } = await FxQuoteCache.create(base);
    await FxQuoteCache.redeem(quoteId, request);
    await expect(FxQuoteCache.redeem(quoteId, request)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a different currency pair (no cross-pair arbitrage)', async () => {
    const { quoteId } = await FxQuoteCache.create(base);
    await expect(
      FxQuoteCache.redeem(quoteId, { ...request, fromCurrency: 'USD', toCurrency: 'NGN' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects another user', async () => {
    const { quoteId } = await FxQuoteCache.create(base);
    await expect(FxQuoteCache.redeem(quoteId, { ...request, userId: 'attacker' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a larger amount than quoted but accepts a smaller one', async () => {
    const big = await FxQuoteCache.create(base);
    await expect(FxQuoteCache.redeem(big.quoteId, { ...request, fromAmount: 101 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const small = await FxQuoteCache.create(base);
    await expect(FxQuoteCache.redeem(small.quoteId, { ...request, fromAmount: 40 })).resolves.toBeDefined();
  });

  it('burns a quote that failed validation so it cannot be retried with other parameters', async () => {
    const { quoteId } = await FxQuoteCache.create(base);
    await expect(FxQuoteCache.redeem(quoteId, { ...request, userId: 'attacker' })).rejects.toThrow();
    await expect(FxQuoteCache.redeem(quoteId, request)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired quote', async () => {
    const { quoteId } = await FxQuoteCache.create(base, -1);
    await expect(FxQuoteCache.redeem(quoteId, request)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only one of two concurrent redemptions succeeds', async () => {
    const { quoteId } = await FxQuoteCache.create(base);
    const results = await Promise.allSettled([
      FxQuoteCache.redeem(quoteId, request),
      FxQuoteCache.redeem(quoteId, request),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('RedisFxQuoteStore (#1377)', () => {
  const quote: FxQuote = { ...base, expiresAt: new Date(Date.now() + 30_000) };

  it('stores with SET PX and redeems with GETDEL, restoring dates', async () => {
    const data = new Map<string, string>();
    const client = {
      set: jest.fn(async (k: string, v: string) => { data.set(k, v); }),
      getdel: jest.fn(async (k: string) => { const v = data.get(k) ?? null; data.delete(k); return v; }),
      eval: jest.fn(),
    };
    const store = new RedisFxQuoteStore(client);
    await store.put('q1', quote, 30_000);
    expect(client.set).toHaveBeenCalledWith('fx:quote:q1', expect.any(String), 'PX', 30_000);

    const taken = await store.take('q1');
    expect(taken?.expiresAt).toBeInstanceOf(Date);
    expect(taken?.rate).toBe(1.08);
    await expect(store.take('q1')).resolves.toBeNull();
  });

  it('falls back to an atomic Lua get-and-delete when GETDEL is unavailable', async () => {
    const client = {
      set: jest.fn(),
      eval: jest.fn().mockResolvedValue(JSON.stringify(quote)),
    };
    const taken = await new RedisFxQuoteStore(client).take('q1');
    expect(client.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('DEL'"), 1, 'fx:quote:q1');
    expect(taken?.userId).toBe('u1');
  });
});

describe('FxService.executeTrade with quotes (#1377)', () => {
  const build = () => {
    const wallets = { adjustBalance: jest.fn().mockResolvedValue(undefined) };
    const rates = { getRate: jest.fn().mockResolvedValue({ rate: 1500 }) };
    const manager = { create: jest.fn((_e, v) => v), save: jest.fn(async (_e, v) => v) };
    const dataSource = { transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)) };
    const service = new FxService({} as any, dataSource as any, {} as any, rates as any, wallets as any);
    return { service, wallets, rates };
  };
  const dto = { userId: 'u1', fromCurrency: 'EUR', toCurrency: 'USD', fromAmount: 100 };

  it('uses the locked rate from a valid quote', async () => {
    const { service, rates } = build();
    const { quoteId } = await FxQuoteCache.create(base);
    const trade = await service.executeTrade({ ...dto, quoteId });
    expect(trade.rate).toBe(1.08);
    expect(rates.getRate).not.toHaveBeenCalled();
  });

  it('rejects a EUR/USD quote used on USD/NGN instead of applying the wrong rate', async () => {
    const { service, wallets } = build();
    const { quoteId } = await FxQuoteCache.create(base);
    await expect(
      service.executeTrade({ ...dto, fromCurrency: 'USD', toCurrency: 'NGN', quoteId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(wallets.adjustBalance).not.toHaveBeenCalled();
  });

  it('rejects an unknown quote id rather than falling back to the live rate', async () => {
    const { service, rates } = build();
    await expect(service.executeTrade({ ...dto, quoteId: 'q_missing' })).rejects.toBeInstanceOf(BadRequestException);
    expect(rates.getRate).not.toHaveBeenCalled();
  });

  it('still uses the live rate when no quote is supplied', async () => {
    const { service, rates } = build();
    await service.executeTrade(dto);
    expect(rates.getRate).toHaveBeenCalledWith('EUR', 'USD');
  });
});
