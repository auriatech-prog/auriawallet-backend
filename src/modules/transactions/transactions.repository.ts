import { createHash } from "node:crypto";
import { pool } from "../../database/db.js";

export type CurrencyCode = "ARS" | "USD" | "EUR";

export interface TransactionResponsePayload {
  transactionId: string;
  type: "buy" | "sell" | "convert";
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  amountDebited: string;
  amountCredited: string;
  exchangeRate: string;
  createdAt: string;
}

export interface AtomicOperationResult {
  statusCode: number;
  body: TransactionResponsePayload;
  isCached: boolean;
}

interface ExecuteAtomicOperationInput {
  userId: string;
  idempotencyKey: string;
  endpoint: string;
  rawPayload: unknown;
  type: "buy" | "sell" | "convert";
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  amountDebited: string;
  amountCredited: string;
  exchangeRate: string;
}

export class TransactionDomainError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
    );
  }
  return value;
}

function hashRequest(endpoint: string, payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ endpoint, payload: canonicalize(payload) }))
    .digest("hex");
}

export async function executeAtomicOperation(
  input: ExecuteAtomicOperationInput,
): Promise<AtomicOperationResult> {
  const client = await pool.connect();
  const requestHash = hashRequest(input.endpoint, input.rawPayload);

  try {
    await client.query("BEGIN");

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      [input.userId, input.idempotencyKey],
    );

    const cached = await client.query<{
      id: string;
      type: "buy" | "sell" | "convert";
      endpoint: string;
      raw_payload: unknown;
      from_currency: CurrencyCode;
      to_currency: CurrencyCode;
      amount_debited: string;
      amount_credited: string;
      exchange_rate: string;
      created_at: Date;
    }>(
      `SELECT t.id, t.type, t.from_currency, t.to_currency,
              t.endpoint, t.raw_payload,
              t.amount_debited::text AS amount_debited,
              t.amount_credited::text AS amount_credited,
              t.exchange_rate::text AS exchange_rate, t.created_at
       FROM transactions AS t
       JOIN wallets AS w ON w.id = t.wallet_id
       WHERE w.user_id = $1 AND t.idempotency_key = $2`,
      [input.userId, input.idempotencyKey],
    );

    if (cached.rows[0]) {
      const row = cached.rows[0];
      if (
        row.endpoint !== input.endpoint ||
        hashRequest(row.endpoint, row.raw_payload) !== requestHash
      ) {
        throw new TransactionDomainError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia ya se utilizó con otra solicitud.",
        );
      }

      await client.query("COMMIT");
      return {
        statusCode: 200,
        isCached: true,
        body: {
          transactionId: row.id,
          type: row.type,
          fromCurrency: row.from_currency,
          toCurrency: row.to_currency,
          amountDebited: row.amount_debited,
          amountCredited: row.amount_credited,
          exchangeRate: row.exchange_rate,
          createdAt: row.created_at.toISOString(),
        },
      };
    }

    const wallet = await client.query<{ id: string }>(
      "SELECT id FROM wallets WHERE user_id = $1",
      [input.userId],
    );
    if (!wallet.rows[0]) {
      throw new TransactionDomainError(404, "USER_NOT_FOUND", "Usuario no encontrado.");
    }

    const walletId = wallet.rows[0].id;

    const lockedCurrencies = [...new Set([input.fromCurrency, input.toCurrency])].sort();
    const balances = await client.query<{ currency: CurrencyCode; amount: string }>(
      `SELECT currency, amount::text AS amount
       FROM wallet_balances
       WHERE wallet_id = $1 AND currency = ANY($2::text[])
       ORDER BY currency
       FOR UPDATE`,
      [walletId, lockedCurrencies],
    );
    const balance = balances.rows.find((row) => row.currency === input.fromCurrency);
    if (!balance) {
      throw new TransactionDomainError(422, "INSUFFICIENT_FUNDS", "Fondos insuficientes.");
    }

    const debited = await client.query<{ amount: string }>(
      `UPDATE wallet_balances
       SET amount = amount - $1::numeric
       WHERE wallet_id = $2 AND currency = $3 AND amount >= $1::numeric
       RETURNING amount::text AS amount`,
      [input.amountDebited, walletId, input.fromCurrency],
    );
    if (!debited.rows[0]) {
      throw new TransactionDomainError(422, "INSUFFICIENT_FUNDS", "Fondos insuficientes.");
    }

    await client.query(
      `INSERT INTO wallet_balances (wallet_id, currency, amount)
       VALUES ($1, $2, $3::numeric)
       ON CONFLICT (wallet_id, currency)
       DO UPDATE SET amount = wallet_balances.amount + EXCLUDED.amount`,
      [walletId, input.toCurrency, input.amountCredited],
    );

    const transaction = await client.query<{
      id: string;
      created_at: Date;
    }>(
      `INSERT INTO transactions (
         wallet_id, idempotency_key, endpoint, raw_payload, type,
         from_currency, to_currency, amount_debited, amount_credited, exchange_rate
       )
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::numeric, $9::numeric, $10::numeric)
       RETURNING id, created_at`,
      [
        walletId,
        input.idempotencyKey,
        input.endpoint,
        JSON.stringify(input.rawPayload),
        input.type,
        input.fromCurrency,
        input.toCurrency,
        input.amountDebited,
        input.amountCredited,
        input.exchangeRate,
      ],
    );

    await client.query("COMMIT");
    const row = transaction.rows[0];
    if (!row) {
      throw new Error("El registro no devolvió la transacción creada");
    }

    return {
      statusCode: 201,
      isCached: false,
      body: {
        transactionId: row.id,
        type: input.type,
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        amountDebited: input.amountDebited,
        amountCredited: input.amountCredited,
        exchangeRate: input.exchangeRate,
        createdAt: row.created_at.toISOString(),
      },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface TransactionHistoryItem {
  id: string;
  type: "buy" | "sell" | "convert";
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  amountDebited: string;
  amountCredited: string;
  exchangeRate: string;
  status: "completed";
  createdAt: string;
}

export interface PaginatedTransactionsResult {
  items: TransactionHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function findUserTransactionsPaginated(
  userId: string,
  limit: number,
  offset: number
): Promise<PaginatedTransactionsResult> {
  const [countResult, rowsResult] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM transactions AS t
       JOIN wallets AS w ON w.id = t.wallet_id
       WHERE w.user_id = $1`,
      [userId]
    ),
    pool.query<{
      id: string;
      type: "buy" | "sell" | "convert";
      from_currency: CurrencyCode;
      to_currency: CurrencyCode;
      amount_debited: string;
      amount_credited: string;
      exchange_rate: string;
      created_at: Date;
    }>(
      `SELECT
         t.id,
         t.type,
         t.from_currency,
         t.to_currency,
         t.amount_debited::text AS amount_debited,
         t.amount_credited::text AS amount_credited,
         t.exchange_rate::text AS exchange_rate,
         t.created_at
       FROM transactions AS t
       JOIN wallets AS w ON w.id = t.wallet_id
       WHERE w.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ),
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);

  const items: TransactionHistoryItem[] = rowsResult.rows.map((row) => ({
    id: row.id,
    type: row.type,
    fromCurrency: row.from_currency,
    toCurrency: row.to_currency,
    amountDebited: row.amount_debited,
    amountCredited: row.amount_credited,
    exchangeRate: row.exchange_rate,
    status: "completed",
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }));

  return {
    items,
    total,
    limit,
    offset,
  };
}
