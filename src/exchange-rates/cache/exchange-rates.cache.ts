export interface CachedRate {
  from: string;
  to: string;
  rate: number;
  cachedAt: number;
}

export class ExchangeRatesCache {
  private readonly cache = new Map<string, CachedRate>();

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number,
  ) {}

  get(from: string, to: string): CachedRate | undefined {
    const key = this.buildKey(from, to);
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // LRU: move the accessed key to the end (most-recently-used position)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry;
  }

  set(from: string, to: string, rate: number): void {
    const key = this.buildKey(from, to);

    // Delete before re-inserting so the key moves to the end
    this.cache.delete(key);

    if (this.cache.size >= this.maxSize) {
      // Evict the least-recently-used entry (first key in insertion order)
      const lruKey = this.cache.keys().next().value;
      if (lruKey !== undefined) {
        this.cache.delete(lruKey);
      }
    }

    this.cache.set(key, { from, to, rate, cachedAt: Date.now() });
  }

  invalidate(from: string, to: string): void {
    this.cache.delete(this.buildKey(from, to));
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  private buildKey(from: string, to: string): string {
    return `${from.toUpperCase()}:${to.toUpperCase()}`;
  }
}
