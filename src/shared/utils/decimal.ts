import { Decimal } from "decimal.js";

// Configuración financiera estándar (20 dígitos de precisión, redondeo bancario)
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * Formatea un valor numérico o string a string decimal de 2 decimales (ej. "150000.00")
 */
export function toMoneyString(value: Decimal.Value): string {
  return new Decimal(value).toFixed(2);
}

/**
 * Formatea tasas de cambio hasta 10 decimales sin ceros innecesarios al final,
 * compatible con NUMERIC(18, 10) de PostgreSQL (ej. "0.0006666667" o "0.92")
 */
export function toRateString(value: Decimal.Value): string {
  const dec = new Decimal(value).toDecimalPlaces(10);
  // Mantiene al menos 2 decimales si es entero o corto (ej. "1600.00", "0.92")
  const str = dec.toString();
  if (!str.includes(".")) return `${str}.00`;
  const decimals = str.split(".")[1] ?? "";
  return decimals.length === 1 ? `${str}0` : str;
}

/**
 * Multiplica monto por tasa y redondea a 2 decimales
 */
export function multiplyMoney(amount: Decimal.Value, rate: Decimal.Value): string {
  return new Decimal(amount).mul(new Decimal(rate)).toFixed(2);
}

/**
 * Divide monto entre tasa y redondea a 2 decimales
 */
export function divideMoney(amount: Decimal.Value, rate: Decimal.Value): string {
  const divisor = new Decimal(rate);
  if (divisor.isZero()) {
    throw new Error("La tasa de cambio no puede ser cero");
  }
  return new Decimal(amount).div(divisor).toFixed(2);
}

/**
 * Suma dos montos exactos
 */
export function addMoney(a: Decimal.Value, b: Decimal.Value): string {
  return new Decimal(a).plus(new Decimal(b)).toFixed(2);
}

/**
 * Resta dos montos exactos (a - b)
 */
export function subtractMoney(a: Decimal.Value, b: Decimal.Value): string {
  return new Decimal(a).minus(new Decimal(b)).toFixed(2);
}

/**
 * Verifica si el saldo disponible cubre el monto a debitar (balance >= debitAmount)
 */
export function hasEnoughFunds(balance: Decimal.Value, debitAmount: Decimal.Value): boolean {
  return new Decimal(balance).greaterThanOrEqualTo(new Decimal(debitAmount));
}

export function formatDecimal(value: Decimal.Value, decimals = 6): string {
  const fixed = new Decimal(value).toFixed(decimals);
  return fixed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

export function multiplyDecimalStrings(
  amount: Decimal.Value,
  rate: Decimal.Value,
  decimals = 6
): string {
  return new Decimal(amount).mul(new Decimal(rate)).toFixed(decimals);
}