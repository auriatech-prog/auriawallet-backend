import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/shared/errors/app-error.js';
import { ExchangeRateCache } from '../src/modules/exchange-rates/exchange-rates.cache.js';
import { getRateFromProviders } from '../src/modules/exchange-rates/exchange-rates.provider.js';
import { validateExchangeRateQuery } from '../src/modules/exchange-rates/exchange-rates.schema.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('exchange-rate query validation', () => {
  it('normalizes supported currencies and returns only the plan query fields', () => {
    expect(validateExchangeRateQuery({ from: ' usd ', to: 'eur', amount: '25' })).toEqual({
      from: 'USD',
      to: 'EUR',
    });
  });

  it('rejects unsupported currencies with a client error', () => {
    expect(() => validateExchangeRateQuery({ from: 'USD', to: 'CAD' })).toThrowError(AppError);
  });
});

describe('exchange-rate cache', () => {
  it('expires cached rates when their TTL elapses', () => {
    vi.useFakeTimers();
    const cache = new ExchangeRateCache(100);
    cache.set('USD', 'EUR', '0.92', 'ExchangeRate-API', new Date().toISOString());

    expect(cache.get('USD', 'EUR')?.rate).toBe('0.92');
    vi.advanceTimersByTime(100);
    expect(cache.get('USD', 'EUR')).toBeNull();
  });
});

describe('exchange-rate providers', () => {
  it('uses Frankfurter when ExchangeRate-API fails', async () => {
    vi.stubEnv('EXCHANGE_RATE_API_URL', 'https://primary.test/v6/latest');
    vi.stubEnv('FRANKFURTER_API_URL', 'https://fallback.test');
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary unavailable'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rates: { EUR: 0.92 } })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getRateFromProviders('USD', 'EUR')).resolves.toMatchObject({
      rate: '0.92',
      provider: 'Frankfurter',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a 503 application error when both providers fail', async () => {
    vi.stubEnv('EXCHANGE_RATE_API_URL', 'https://primary.test/v6/latest');
    vi.stubEnv('FRANKFURTER_API_URL', 'https://fallback.test');
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockResolvedValueOnce(new Response('', { status: 503 }))
    );

    await expect(getRateFromProviders('USD', 'EUR')).rejects.toMatchObject({
      statusCode: 503,
      code: 'RATE_UNAVAILABLE',
    });
  });
});
