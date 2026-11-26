import { pool } from "../../config/database.js";
import {
  type ChatProviderResponse,
  generateChatReply,
  type WalletReadOnlyContext,
} from "./chat.provider.js";

function formatDecimal(value: string, decimals: number, minimumDecimals = 0): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Valor decimal inválido: ${value}`);
  }

  const [, sign, whole = "0", fraction = ""] = match;
  const factor = 10n ** BigInt(decimals);
  let units = BigInt(whole) * factor +
    BigInt(fraction.slice(0, decimals).padEnd(decimals, "0") || "0");
  const discarded = fraction.slice(decimals);
  if (discarded) {
    const firstDiscarded = discarded[0] ?? "0";
    const remainingNonZero = /[1-9]/.test(discarded.slice(1));
    if (
      firstDiscarded > "5" ||
      (firstDiscarded === "5" && (remainingNonZero || units % 2n === 1n))
    ) {
      units += 1n;
    }
  }

  const prefix = sign === "-" && units > 0n ? "-" : "";
  const integer = (units / factor).toString();
  const decimalPart = (units % factor).toString().padStart(decimals, "0");
  const trimmedDecimal = decimalPart.replace(/0+$/, "");
  const formattedDecimal = trimmedDecimal.padEnd(minimumDecimals, "0");
  return formattedDecimal
    ? `${prefix}${integer}.${formattedDecimal}`
    : `${prefix}${integer}`;
}

function toMoneyString(value: string): string {
  return formatDecimal(value, 2, 2);
}

function toRateString(value: string): string {
  return formatDecimal(value, 10, 2);
}

export class ChatServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ChatServiceError";
  }
}

export class ChatService {
  async askAssistant(userId: string, message: string): Promise<ChatProviderResponse> {
    const context = await this.fetchReadOnlyWalletContext(userId);
    return generateChatReply(message, context);
  }

  /**
   * Consulta estrictamente en modo SOLO LECTURA los saldos actuales
   * y las últimas 10 transacciones del usuario autenticado.
   */
  private async fetchReadOnlyWalletContext(userId: string): Promise<WalletReadOnlyContext> {
    try {
      const [balancesResult, transactionsResult] = await Promise.all([
        pool.query<{ currency: string; balance: string }>(
          `SELECT b.currency, b.amount::text AS balance
           FROM wallet_balances AS b
           JOIN wallets AS w ON w.id = b.wallet_id
           WHERE w.user_id = $1
           ORDER BY b.currency ASC`,
          [userId]
        ),
        pool.query<{
          type: string;
          from_currency: string;
          to_currency: string;
          amount_debited: string;
          amount_credited: string;
          exchange_rate: string;
          created_at: Date;
        }>(
          `SELECT
             type,
             from_currency,
             to_currency,
             amount_debited::text AS amount_debited,
             amount_credited::text AS amount_credited,
             exchange_rate::text AS exchange_rate,
             created_at
           FROM transactions AS t
           JOIN wallets AS w ON w.id = t.wallet_id
           WHERE w.user_id = $1
           ORDER BY t.created_at DESC
           LIMIT 10`,
          [userId]
        ),
      ]);

      return {
        balances: balancesResult.rows.map((row) => ({
          currency: row.currency,
          balance: toMoneyString(row.balance),
        })),
        recentTransactions: transactionsResult.rows.map((row) => ({
          type: row.type,
          fromCurrency: row.from_currency,
          toCurrency: row.to_currency,
          amountDebited: toMoneyString(row.amount_debited),
          amountCredited: toMoneyString(row.amount_credited),
          exchangeRate: toRateString(row.exchange_rate),
          createdAt:
            row.created_at instanceof Date
              ? row.created_at.toISOString()
              : String(row.created_at),
        })),
      };
    } catch (error) {
      console.error("[ChatService] Error leyendo contexto de billetera:", error);
      throw new ChatServiceError(
        503,
        "CHAT_SERVICE_UNAVAILABLE",
        "El servicio de asistencia no está disponible en este momento."
      );
    }
  }
}

export const chatService = new ChatService();