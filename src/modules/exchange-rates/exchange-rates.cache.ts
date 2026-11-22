export interface CachedRateEntry {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  provider: string;
  fetchedAt: string;
  expiresAt: number;
}

export class ExchangeRateCache {
  private readonly store = new Map<string, CachedRateEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  private getKey(from: string, to: string): string {
    return `${from}_${to}`;
  }

  public get(from: string, to: string): CachedRateEntry | null {
    const entry = this.store.get(this.getKey(from, to));
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(this.getKey(from, to));
      return null;
    }

    return entry;
  }

  public set(
    from: string,
    to: string,
    rate: string,
    provider: string,
    fetchedAt: string
  ): CachedRateEntry {
    const entry: CachedRateEntry = {
      fromCurrency: from,
      toCurrency: to,
      rate,
      provider,
      fetchedAt,
      expiresAt: Date.now() + this.ttlMs,
    };
    this.store.set(this.getKey(from, to), entry);
    return entry;
  }
}