export function formatDecimal(value: number, decimals = 6): string {
  if (!Number.isFinite(value)) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Valor numérico inválido en cotización.');
  }
  return value.toFixed(decimals).replace(/\.?0+$/, '') || '0';
}

import { AppError } from '../errors/app-error';