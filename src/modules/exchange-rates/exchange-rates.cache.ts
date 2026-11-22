import type { SupportedCurrency } from '../../config/currencies.js';
import type { ProviderRateResult } from './exchange-rates.provider.js';

export interface CachedRateEntry {
  fromCurrency: SupportedCurrency;
  toCurrency: SupportedCurrency;
  rate: string;
  provider: ProviderRateResult['provider'];
  fetchedAt: string;
  expiresAt: number;
}

export class ExchangeRateCache {
  private readonly store = new Map<string, CachedRateEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError('El TTL de caché debe ser un número positivo.');
    }
    this.ttlMs = ttlMs;
  }

  private getKey(from: SupportedCurrency, to: SupportedCurrency): string {
    return `${from}:${to}`;
  }

  public get(from: SupportedCurrency, to: SupportedCurrency): CachedRateEntry | null {
    const entry = this.store.get(this.getKey(from, to));
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(this.getKey(from, to));
      return null;
    }

    return entry;
  }

  public set(
    from: SupportedCurrency,
    to: SupportedCurrency,
    rate: string,
    provider: ProviderRateResult['provider'],
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