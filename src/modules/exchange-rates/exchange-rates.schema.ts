import { AppError } from '../../shared/errors/app-error.js';
import { isSupportedCurrency, type SupportedCurrency } from '../../config/currencies.js';

export interface ExchangeRateQuery {
  from: SupportedCurrency;
  to: SupportedCurrency;
}

export function validateExchangeRateQuery(rawQuery: Record<string, unknown>): ExchangeRateQuery {
  const fromRaw = typeof rawQuery.from === 'string' ? rawQuery.from.trim().toUpperCase() : '';
  const toRaw = typeof rawQuery.to === 'string' ? rawQuery.to.trim().toUpperCase() : '';

  if (!fromRaw || !toRaw || !isSupportedCurrency(fromRaw) || !isSupportedCurrency(toRaw)) {
    throw new AppError(
      400,
      'INVALID_CURRENCIES',
      'Parámetros from y to inválidos. Monedas soportadas: USD, EUR, ARS.'
    );
  }

  return {
    from: fromRaw,
    to: toRaw,
  };
}