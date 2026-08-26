export class FxQuoteCache {
  private static readonly cache = new Map<string, { rate: number; expiresAt: Date }>();

  static set(quoteId: string, rate: number, expiresAt: Date): void {
    this.cache.set(quoteId, { rate, expiresAt });
  }

  static get(quoteId: string): number | null {
    const entry = this.cache.get(quoteId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt.getTime()) {
      this.cache.delete(quoteId);
      return null;
    }
    return entry.rate;
  }

  static clear(): void {
    this.cache.clear();
  }
}
