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

export function toMoneyString(value: string | number): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!match) {
    throw new Error(`Valor decimal inválido: ${value}`);
  }

  const [, sign, whole = "0", fraction = ""] = match;
  let minorUnits =
    BigInt(whole) * 100n + BigInt(fraction.padEnd(3, "0").slice(0, 2) || "0");
  if ((fraction[2] ?? "0") >= "5") {
    minorUnits += 1n;
  }

  const prefix = sign === "-" && minorUnits > 0n ? "-" : "";
  return `${prefix}${minorUnits / 100n}.${(minorUnits % 100n).toString().padStart(2, "0")}`;
}

export function toRateString(value: string | number): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`Valor decimal inválido: ${value}`);
  }
  return formatDecimal(numericValue, 10);
}

function parseMinorUnits(value: string | number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!match) {
    throw new Error(`Valor decimal inválido: ${value}`);
  }
  const [, sign, whole = "0", fraction = ""] = match;
  const units = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return sign === "-" ? -units : units;
}

function formatMinorUnits(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function addMoney(a: string | number, b: string | number): string {
  return formatMinorUnits(parseMinorUnits(a) + parseMinorUnits(b));
}

export function subtractMoney(a: string | number, b: string | number): string {
  return formatMinorUnits(parseMinorUnits(a) - parseMinorUnits(b));
}

export function multiplyMoney(amount: string | number, rate: string | number): string {
  const parse = (value: string | number) => {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
    if (!match) {
      throw new Error(`Valor decimal inválido: ${value}`);
    }
    const [, sign, whole = "0", fraction = ""] = match;
    const scale = 10n ** BigInt(fraction.length);
    const units = BigInt(whole) * scale + BigInt(fraction || "0");
    return { units: sign === "-" ? -units : units, scale };
  };
  const parsedAmount = parse(amount);
  const parsedRate = parse(rate);
  const numerator = parsedAmount.units * parsedRate.units * 100n;
  const denominator = parsedAmount.scale * parsedRate.scale;
  const rounded =
    (numerator + (numerator >= 0n ? denominator / 2n : -(denominator / 2n))) /
    denominator;
  return formatMinorUnits(rounded);
}

export function hasEnoughFunds(balance: string | number, debitAmount: string | number): boolean {
  return parseMinorUnits(balance) >= parseMinorUnits(debitAmount);
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