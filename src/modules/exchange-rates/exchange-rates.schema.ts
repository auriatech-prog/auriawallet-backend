import { AppError } from '../../shared/errors/app-error.js';
import { isSupportedCurrency, type SupportedCurrency } from '../../config/currencies.js';

export interface ExchangeRateQuery {
  from: SupportedCurrency;
  to: SupportedCurrency;
  amount?: number;
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

  let amount: number | undefined;
  if (rawQuery.amount !== undefined) {
    if (typeof rawQuery.amount !== 'string' || rawQuery.amount.trim() === '') {
      throw new AppError(400, 'INVALID_AMOUNT', 'El parámetro amount debe ser un string decimal válido.');
    }
    const parsed = Number(rawQuery.amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new AppError(400, 'INVALID_AMOUNT', 'El monto debe ser mayor a cero.');
    }
    amount = parsed;
  }

  return {
    from: fromRaw,
    to: toRaw,
    ...(amount !== undefined ? { amount } : {}),
  };
}