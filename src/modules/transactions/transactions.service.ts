import { getExchangeRates } from '../exchange-rates/exchange-rates.service.js';
import {
  multiplyMoney,
  toMoneyString,
  toRateString,
} from '../../shared/utils/decimal.js';
import {
  executeAtomicOperation,
  TransactionDomainError,
  type AtomicOperationResult,
  type CurrencyCode,
} from './transactions.repository.js';

export interface BuyTransactionInput {
  currency: 'USD' | 'EUR';
  amount: string;
}

export interface SellTransactionInput {
  currency: 'USD' | 'EUR';
  amount: string;
}

export interface ConvertTransactionInput {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  amount: string;
}

type ExchangeRateMatrix = {
  rates?: Record<string, Record<string, string> | string>;
};

async function getRate(from: CurrencyCode, to: CurrencyCode): Promise<string> {
  try {
    const data = await getExchangeRates() as ExchangeRateMatrix;
    const direct = data.rates?.[from];
    const rate = typeof direct === 'object' ? direct?.[to] : undefined;
    if (rate && Number(rate) > 0) {
      return String(rate);
    }

    const arsPerFrom = from === 'ARS'
      ? 1
      : Number(typeof data.rates?.[from] === 'object'
        ? data.rates?.[from]?.ARS
        : data.rates?.[from]);
    const arsPerTo = to === 'ARS'
      ? 1
      : Number(typeof data.rates?.[to] === 'object'
        ? data.rates?.[to]?.ARS
        : data.rates?.[to]);
    if (!Number.isFinite(arsPerFrom) || !Number.isFinite(arsPerTo) || arsPerFrom <= 0 || arsPerTo <= 0) {
      throw new Error('Cotización no disponible');
    }
    return String(arsPerFrom / arsPerTo);
  } catch {
    throw new TransactionDomainError(
      503,
      'EXCHANGE_RATE_UNAVAILABLE',
      'El servicio de cotizaciones no está disponible temporalmente.',
    );
  }
}

export class TransactionsService {
  async buyCurrency(
    userId: string,
    idempotencyKey: string,
    input: BuyTransactionInput,
  ): Promise<AtomicOperationResult> {
    const amountCredited = toMoneyString(input.amount);
    const arsPerUnit = await getRate(input.currency, 'ARS');
    return executeAtomicOperation({
      userId,
      idempotencyKey,
      endpoint: 'POST /api/transactions/buy',
      rawPayload: input,
      type: 'buy',
      fromCurrency: 'ARS',
      toCurrency: input.currency,
      amountDebited: multiplyMoney(amountCredited, arsPerUnit),
      amountCredited,
      exchangeRate: toRateString(1 / Number(arsPerUnit)),
    });
  }

  async sellCurrency(
    userId: string,
    idempotencyKey: string,
    input: SellTransactionInput,
  ): Promise<AtomicOperationResult> {
    const amountDebited = toMoneyString(input.amount);
    const arsPerUnit = await getRate(input.currency, 'ARS');
    return executeAtomicOperation({
      userId,
      idempotencyKey,
      endpoint: 'POST /api/transactions/sell',
      rawPayload: input,
      type: 'sell',
      fromCurrency: input.currency,
      toCurrency: 'ARS',
      amountDebited,
      amountCredited: multiplyMoney(amountDebited, arsPerUnit),
      exchangeRate: toRateString(arsPerUnit),
    });
  }

  async convertCurrency(
    userId: string,
    idempotencyKey: string,
    input: ConvertTransactionInput,
  ): Promise<AtomicOperationResult> {
    const amountDebited = toMoneyString(input.amount);
    const rate = await getRate(input.fromCurrency, input.toCurrency);
    return executeAtomicOperation({
      userId,
      idempotencyKey,
      endpoint: 'POST /api/transactions/convert',
      rawPayload: input,
      type: 'convert',
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      amountDebited,
      amountCredited: multiplyMoney(amountDebited, rate),
      exchangeRate: toRateString(rate),
    });
  }
}

export const transactionsService = new TransactionsService();
