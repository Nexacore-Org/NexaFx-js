import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';

/** What a locked rate is bound to. A quote is only valid for exactly this. */
export interface FxQuote {
  userId: string;
  fromCurrency: string;
  toCurrency: string;
  /** Maximum amount the quote may be redeemed for. */
  fromAmount: number;
  rate: number;
  expiresAt: Date;
}

/** Storage backend. `take` must read-and-delete atomically so a quote is single use. */
export interface FxQuoteStore {
  put(quoteId: string, quote: FxQuote, ttlMs: number): Promise<void>;
  take(quoteId: string): Promise<FxQuote | null>;
  clear?(): Promise<void>;
}

export class MemoryFxQuoteStore implements FxQuoteStore {
  private readonly entries = new Map<string, FxQuote>();

  async put(quoteId: string, quote: FxQuote): Promise<void> {
    this.entries.set(quoteId, quote);
  }

  // Map get + delete run in one synchronous step, so two redemptions cannot both succeed.
  async take(quoteId: string): Promise<FxQuote | null> {
    const quote = this.entries.get(quoteId) ?? null;
    this.entries.delete(quoteId);
    return quote;
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

/** The subset of an ioredis-style client the Redis store needs. */
export interface RedisLikeClient {
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  getdel?(key: string): Promise<string | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

const GET_AND_DELETE_LUA =
  "local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]) end; return v";

/** Shared across replicas: `SET key value PX ttl` to store, `GETDEL` to redeem. */
export class RedisFxQuoteStore implements FxQuoteStore {
  constructor(private readonly client: RedisLikeClient, private readonly prefix = 'fx:quote:') {}

  async put(quoteId: string, quote: FxQuote, ttlMs: number): Promise<void> {
    await this.client.set(`${this.prefix}${quoteId}`, JSON.stringify(quote), 'PX', ttlMs);
  }

  async take(quoteId: string): Promise<FxQuote | null> {
    const key = `${this.prefix}${quoteId}`;
    const raw =
      typeof this.client.getdel === 'function'
        ? await this.client.getdel(key)
        : ((await this.client.eval(GET_AND_DELETE_LUA, 1, key)) as string | null);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Omit<FxQuote, 'expiresAt'> & { expiresAt: string };
    return { ...parsed, expiresAt: new Date(parsed.expiresAt) };
  }
}

export const QUOTE_TTL_MS = 30_000;

/**
 * Locked FX rates. Each quote is bound to a user, a currency pair and a maximum
 * amount, has an unguessable id, and can be redeemed exactly once.
 */
export class FxQuoteCache {
  private static store: FxQuoteStore = new MemoryFxQuoteStore();

  /** Swap the backend (Redis in production, memory in tests). */
  static use(store: FxQuoteStore): void {
    this.store = store;
  }

  static async create(
    quote: Omit<FxQuote, 'expiresAt'>,
    ttlMs: number = QUOTE_TTL_MS,
  ): Promise<{ quoteId: string; expiresAt: Date }> {
    const quoteId = `q_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.store.put(quoteId, { ...quote, expiresAt }, ttlMs);
    return { quoteId, expiresAt };
  }

  /**
   * Consume a quote for a trade. The quote is deleted by this call whether or
   * not it matches, so it can never be tried against a second pair/amount.
   * Missing, expired, used or mismatched quotes are rejected with 400; there is
   * deliberately no silent fallback to the live rate.
   */
  static async redeem(
    quoteId: string,
    request: { userId: string; fromCurrency: string; toCurrency: string; fromAmount: number },
  ): Promise<FxQuote> {
    const quote = await this.store.take(quoteId);
    if (!quote || Date.now() > quote.expiresAt.getTime()) {
      throw new BadRequestException('Quote is invalid, expired or has already been used');
    }
    if (
      quote.userId !== request.userId ||
      quote.fromCurrency.toUpperCase() !== request.fromCurrency.toUpperCase() ||
      quote.toCurrency.toUpperCase() !== request.toCurrency.toUpperCase()
    ) {
      throw new BadRequestException('Quote does not match this user or currency pair');
    }
    if (request.fromAmount > quote.fromAmount) {
      throw new BadRequestException('Trade amount exceeds the quoted amount');
    }
    return quote;
  }

  static async clear(): Promise<void> {
    await this.store.clear?.();
  }
}
