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