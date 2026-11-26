import {
  multiplyMoney,
  toMoneyString,
  toRateString,
} from "../../shared/utils/decimal.js";
import { resolveExchangeRate } from "../exchange-rates/exchange-rates.service.js";
import {
  executeAtomicOperation,
  findUserTransactionsPaginated,
  TransactionDomainError,
  type AtomicOperationResult,
  type CurrencyCode,
  type PaginatedTransactionsResult,
  type TransactionResponsePayload,
} from "./transactions.repository.js";
import type {
  BuyTransactionInput,
  ConvertTransactionInput,
  SellTransactionInput,
} from "./transactions.schema.js";

export interface ReceiptNotifier {
  sendTransactionReceipt(params: {
    userId: string;
    transaction: TransactionResponsePayload;
  }): Promise<void> | void;
}

const defaultNoopNotifier: ReceiptNotifier = {
  sendTransactionReceipt({ userId, transaction }) {
    console.info(
      `[Notifications Hook] Comprobante pendiente para user=${userId}, tx=${transaction.transactionId}`
    );
  },
};

export class TransactionsService {
  constructor(private readonly notifier: ReceiptNotifier = defaultNoopNotifier) {}

  async buyCurrency(
    userId: string,
    idempotencyKey: string,
    input: BuyTransactionInput
  ): Promise<AtomicOperationResult> {
    const targetCurrency: CurrencyCode = input.currency;
    const amountToReceive = toMoneyString(input.amount);
    const arsPerTargetUnit = await this.resolveRateToArs(targetCurrency);
    const amountDebitedArs = multiplyMoney(amountToReceive, arsPerTargetUnit);
    const effectiveRate = toRateString(1 / Number(arsPerTargetUnit));

    const result = await executeAtomicOperation({
      userId,
      idempotencyKey,
      endpoint: "POST /api/transactions/buy",
      rawPayload: input,
      type: "buy",
      fromCurrency: "ARS",
      toCurrency: targetCurrency,
      amountDebited: amountDebitedArs,
      amountCredited: amountToReceive,
      exchangeRate: effectiveRate,
    });

    if (!result.isCached) {
      this.triggerReceiptNotification(userId, result.body);
    }
    return result;
  }

  async sellCurrency(
    userId: string,
    idempotencyKey: string,
    input: SellTransactionInput
  ): Promise<AtomicOperationResult> {
    const sourceCurrency: CurrencyCode = input.currency;
    const amountToSell = toMoneyString(input.amount);
    const arsPerSourceUnit = await this.resolveRateToArs(sourceCurrency);
    const amountCreditedArs = multiplyMoney(amountToSell, arsPerSourceUnit);
    const effectiveRate = toRateString(arsPerSourceUnit);

    const result = await executeAtomicOperation({
      userId,
      idempotencyKey,
      endpoint: "POST /api/transactions/sell",
      rawPayload: input,
      type: "sell",
      fromCurrency: sourceCurrency,
      toCurrency: "ARS",
      amountDebited: amountToSell,
      amountCredited: amountCreditedArs,
      exchangeRate: effectiveRate,
    });

    if (!result.isCached) {
      this.triggerReceiptNotification(userId, result.body);
    }
    return result;
  }

  async convertCurrency(
    userId: string,
    idempotencyKey: string,
    input: ConvertTransactionInput
  ): Promise<AtomicOperationResult> {
    const amountToDebit = toMoneyString(input.amount);
    const directRate = await this.resolvePairRate(
      input.fromCurrency,
      input.toCurrency
    );
    const amountCredited = multiplyMoney(amountToDebit, directRate);
    const formattedRate = toRateString(directRate);

    const result = await executeAtomicOperation({
      userId,
      idempotencyKey,
      endpoint: "POST /api/transactions/convert",
      rawPayload: input,
      type: "convert",
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      amountDebited: amountToDebit,
      amountCredited,
      exchangeRate: formattedRate,
    });

    if (!result.isCached) {
      this.triggerReceiptNotification(userId, result.body);
    }
    return result;
  }

  async getTransactionsHistory(
    userId: string,
    limit: number,
    offset: number
  ): Promise<PaginatedTransactionsResult> {
    return findUserTransactionsPaginated(userId, limit, offset);
  }

  private async resolveRateToArs(foreignCurrency: "USD" | "EUR"): Promise<string> {
    try {
      const ratesData = await resolveExchangeRate(foreignCurrency, "ARS");
      const rate = ratesData.rate;
      if (!rate || Number(rate) <= 0) {
        throw new Error("Tasa no disponible");
      }
      return rate;
    } catch {
      throw new TransactionDomainError(
        503,
        "EXCHANGE_RATE_UNAVAILABLE",
        "El servicio de cotizaciones no está disponible temporalmente. Intente nuevamente."
      );
    }
  }

  private async resolvePairRate(
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode
  ): Promise<string> {
    try {
      const result = await resolveExchangeRate(fromCurrency, toCurrency);
      if (!result.rate || Number(result.rate) <= 0) {
        throw new Error("Par de monedas sin tasa disponible");
      }
      return result.rate;
    } catch {
      throw new TransactionDomainError(
        503,
        "EXCHANGE_RATE_UNAVAILABLE",
        "El servicio de cotizaciones no está disponible temporalmente. Intente nuevamente."
      );
    }
  }

  private triggerReceiptNotification(
    userId: string,
    transaction: TransactionResponsePayload
  ): void {
    Promise.resolve()
      .then(() => this.notifier.sendTransactionReceipt({ userId, transaction }))
      .catch((err) => {
        console.error("[Notifications Hook] Error asíncrono enviando comprobante:", err);
      });
  }
}

export const transactionsService = new TransactionsService();