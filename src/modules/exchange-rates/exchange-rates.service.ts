import type { SupportedCurrency } from '../../config/currencies.js';
import { ExchangeRateCache } from './exchange-rates.cache.js';
import { getRateFromProviders, type ProviderRateResult } from './exchange-rates.provider.js';

const configuredTtl = process.env.EXCHANGE_RATE_CACHE_TTL_MS;
const ttlMs = configuredTtl === undefined ? 300000 : Number(configuredTtl);
const rateCache = new ExchangeRateCache(ttlMs);

export interface ExchangeRateResponse {
  fromCurrency: SupportedCurrency;
  toCurrency: SupportedCurrency;
  rate: string;
  provider: ProviderRateResult['provider'];
  fetchedAt: string;
}

export async function resolveExchangeRate(
  from: SupportedCurrency,
  to: SupportedCurrency
): Promise<ExchangeRateResponse> {
  const cached = rateCache.get(from, to);
  const rateInfo = cached ?? (await getRateFromProviders(from, to));

  if (!cached) {
    rateCache.set(from, to, rateInfo.rate, rateInfo.provider, rateInfo.fetchedAt);
  }

  return {
    fromCurrency: from,
    toCurrency: to,
    rate: rateInfo.rate,
    provider: rateInfo.provider,
    fetchedAt: rateInfo.fetchedAt,
  };
}