// src/shared/utils/decimal.ts
const SCALE = 1_000_000n; // 6 decimales de precisión interna

function parseToScaledBigInt(value: string, scale = SCALE): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Valor decimal inválido: ${value}`);
  }

  const [intPart = '0', fracPart = ''] = normalized.split('.');
  const scaleDigits = scale.toString().length - 1;
  const paddedFrac = fracPart.padEnd(scaleDigits, '0').slice(0, scaleDigits);

  return BigInt(intPart) * scale + BigInt(paddedFrac || '0');
}

function formatScaledBigInt(scaledValue: bigint, decimals = 6): string {
  const isNegative = scaledValue < 0n;
  const absValue = isNegative ? -scaledValue : scaledValue;
  const factor = 10n ** BigInt(decimals);

  const intPart = absValue / factor;
  const fracPart = (absValue % factor)
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');

  const sign = isNegative ? '-' : '';
  return fracPart.length > 0 ? `${sign}${intPart.toString()}.${fracPart}` : `${sign}${intPart.toString()}`;
}

export function formatDecimal(num: number, decimals = 6): string {
  if (!Number.isFinite(num)) {
    return '0';
  }
  const fixed = num.toFixed(decimals);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
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
 * Multiplica dos strings decimales (ej. monto * tasa) y devuelve un string decimal.
 */
export function multiplyDecimalStrings(amountStr: string, rateStr: string, decimals = 6): string {
  const amountScaled = parseToScaledBigInt(amountStr, SCALE);
  const rateScaled = parseToScaledBigInt(rateStr, SCALE);

  // (amount * 10^6) * (rate * 10^6) / 10^12 => escalado a 10^decimals
  const product = amountScaled * rateScaled;
  const outputFactor = 10n ** BigInt(decimals);
  const denominator = SCALE * SCALE;

  // Redondeo al entero más cercano
  const scaledResult = (product * outputFactor + denominator / 2n) / denominator;
  return formatScaledBigInt(scaledResult, decimals);
}