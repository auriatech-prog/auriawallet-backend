// src/modules/exchange-rates/exchange-rates.service.ts
import type { SupportedCurrency } from '../../config/currencies.js';
import { multiplyDecimalStrings } from '../../shared/utils/decimal.js';
import { ExchangeRateCache } from './exchange-rates.cache.js';
import { getRateFromProviders } from './exchange-rates.provider.js';
import type { ProviderRateResult } from './exchange-rates.provider.js';

const ttlMinutes = Number(process.env.EXCHANGE_RATE_CACHE_TTL_MINUTES || '5');
const defaultCache = new ExchangeRateCache(
  Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes * 60 * 1000 : 5 * 60 * 1000
);

export interface ExchangeRateResult {
  fromCurrency: SupportedCurrency;
  toCurrency: SupportedCurrency;
  rate: string;
  provider: string;
  cached: boolean;
  fetchedAt: string;
  amount?: string;
  convertedAmount?: string;
}

export class ExchangeRatesService {
  constructor(private readonly cache: ExchangeRateCache = defaultCache) {}

  public async getExchangeRate(params: {
    from: SupportedCurrency;
    to: SupportedCurrency;
    amount?: string;
  }): Promise<ExchangeRateResult> {
    const { from, to, amount } = params;

    const cachedEntry = this.cache.get(from, to);
    let rate: string;
    let provider: ProviderRateResult['provider'];
    let fetchedAt: string;
    let cached = false;

    if (cachedEntry) {
      rate = cachedEntry.rate;
      provider = cachedEntry.provider;
      fetchedAt = cachedEntry.fetchedAt;
      cached = true;
    } else {
      const fresh = await getRateFromProviders(from, to);
      rate = fresh.rate;
      provider = fresh.provider;
      fetchedAt = fresh.fetchedAt;
      this.cache.set(from, to, rate, provider, fetchedAt);
    }

    const result: ExchangeRateResult = {
      fromCurrency: from,
      toCurrency: to,
      rate,
      provider,
      cached,
      fetchedAt,
    };

    if (amount !== undefined) {
      const decimals = to === 'ARS' ? 2 : 4;
      result.amount = amount;
      result.convertedAmount = multiplyDecimalStrings(amount, rate, decimals);
    }

    return result;
  }
}

export const exchangeRatesService = new ExchangeRatesService();

export async function resolveExchangeRate(
  from: SupportedCurrency,
  to: SupportedCurrency,
  amount?: string
): Promise<ExchangeRateResult> {
  if (amount === undefined) {
    return exchangeRatesService.getExchangeRate({ from, to });
  }

  return exchangeRatesService.getExchangeRate({ from, to, amount });
}