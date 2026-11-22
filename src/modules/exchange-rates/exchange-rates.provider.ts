import type { SupportedCurrency } from '../../config/currencies.js';
import { AppError } from '../../shared/errors/app-error.js';
import { formatDecimal } from '../../shared/utils/decimal.js';

export interface ProviderRateResult {
  rate: string;
  provider: 'ExchangeRate-API' | 'Frankfurter';
  fetchedAt: string;
}

const TIMEOUT_MS = 4000;

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFromExchangeRateApi(
  from: SupportedCurrency,
  to: SupportedCurrency
): Promise<ProviderRateResult> {
  const baseUrl = process.env.EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest';
  const data = await fetchJsonWithTimeout<{
    result?: string;
    rates?: Record<string, number>;
  }>(`${baseUrl}/${from}`);

  const rawRate = data?.rates?.[to];
  if (data?.result !== 'success' || typeof rawRate !== 'number' || rawRate <= 0) {
    throw new Error('Respuesta inválida de ExchangeRate-API');
  }

  return {
    rate: formatDecimal(rawRate, 6),
    provider: 'ExchangeRate-API',
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchFromFrankfurter(
  from: SupportedCurrency,
  to: SupportedCurrency
): Promise<ProviderRateResult> {
  const baseUrl = process.env.FRANKFURTER_API_URL || 'https://api.frankfurter.app';

  // Frankfurter opera principalmente con divisas internacionales (USD/EUR); si involucra ARS sin soporte directo, intenta vía EUR
  if (from === 'ARS' || to === 'ARS') {
    const eurData = await fetchJsonWithTimeout<{ rates?: Record<string, number> }>(
      `${baseUrl}/latest?from=EUR&to=USD`
    );
    const usdPerEur = eurData?.rates?.USD;
    if (typeof usdPerEur !== 'number' || usdPerEur <= 0) {
      throw new Error('No se pudo obtener respaldo de Frankfurter para par con ARS');
    }
    throw new Error('Frankfurter no provee cotización directa para ARS');
  }

  const data = await fetchJsonWithTimeout<{ rates?: Record<string, number> }>(
    `${baseUrl}/latest?from=${from}&to=${to}`
  );
  const rawRate = data?.rates?.[to];

  if (typeof rawRate !== 'number' || rawRate <= 0) {
    throw new Error('Respuesta inválida de Frankfurter');
  }

  return {
    rate: formatDecimal(rawRate, 6),
    provider: 'Frankfurter',
    fetchedAt: new Date().toISOString(),
  };
}

export async function getRateFromProviders(
  from: SupportedCurrency,
  to: SupportedCurrency
): Promise<ProviderRateResult> {
  if (from === to) {
    return {
      rate: '1',
      provider: 'ExchangeRate-API',
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    return await fetchFromExchangeRateApi(from, to);
  } catch {
    try {
      return await fetchFromFrankfurter(from, to);
    } catch {
      throw new AppError(
        503,
        'RATE_UNAVAILABLE',
        'No hay cotización disponible en este momento.'
      );
    }
  }
}