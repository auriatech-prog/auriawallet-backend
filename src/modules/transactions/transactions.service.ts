import {
  multiplyMoney,
  toMoneyString,
  toRateString,
} from "../../shared/utils/decimal.js";
// Ajusta este import al nombre exacto de tu servicio del Sprint 1:
import { resolveExchangeRate } from "../exchange-rates/exchange-rates.service.js";
import {
  executeAtomicOperation,
  TransactionDomainError,
  type AtomicOperationResult,
  type CurrencyCode,
  type TransactionResponsePayload,
} from "./transactions.repository.js";
import type { BuyTransactionInput, SellTransactionInput } from "./transactions.schema.js";

/**
 * Interfaz desacoplada para conectar notifications.service.ts de Aldana
 * cuando ella integre AWS SES.
 */
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

  /**
   * Compra USD o EUR pagando con ARS.
   * Contrato: fromCurrency = "ARS", toCurrency = "USD" | "EUR", amountCredited = amount
   */
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

  /**
   * Vende USD o EUR recibiendo ARS.
   * Contrato: fromCurrency = "USD" | "EUR", toCurrency = "ARS", amountDebited = amount
   */
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

  /**
   * Consulta cuántos ARS equivale 1 unidad de USD o EUR usando el servicio del Sprint 1.
   */
  private async resolveRateToArs(foreignCurrency: "USD" | "EUR"): Promise<string> {
    try {
      const ratesData = await resolveExchangeRate(foreignCurrency, "ARS");
      const rate = ratesData.rate;

      if (!rate || Number(rate) <= 0) {
        throw new Error("Tasa no disponible");
      }

      return String(rate);
    } catch {
      throw new TransactionDomainError(
        503,
        "EXCHANGE_RATE_UNAVAILABLE",
        "El servicio de cotizaciones no está disponible temporalmente. Intente nuevamente."
      );
    }
  }

  /**
   * Dispara el comprobante de forma asíncrona sin bloquear la respuesta 201.
   */
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
