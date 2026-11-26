import { createHash } from 'node:crypto';
import { pool } from '../../database/db.js';

export type CurrencyCode = 'ARS' | 'USD' | 'EUR';
export type TransactionType = 'buy' | 'sell' | 'convert';

export interface TransactionResponsePayload {
  transactionId: string;
  type: TransactionType;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  amountDebited: string;
  amountCredited: string;
  exchangeRate: string;
  status: 'completed';
}

export interface AtomicOperationResult {
  statusCode: number;
  body: TransactionResponsePayload;
  isCached: boolean;
}

export class TransactionDomainError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TransactionDomainError';
  }
}

export interface AtomicOperationInput {
  userId: string;
  idempotencyKey: string;
  endpoint: string;
  rawPayload: unknown;
  type: TransactionType;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  amountDebited: string;
  amountCredited: string;
  exchangeRate: string;
}

const operationTails = new Map<string, Promise<void>>();

async function serializeByBalance<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = operationTails.get(key) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  operationTails.set(key, tail);
  await previous;

  try {
    return await operation();
  } finally {
    release();
    if (operationTails.get(key) === tail) {
      operationTails.delete(key);
    }
  }
}

export async function executeAtomicOperation(
  input: AtomicOperationInput,
): Promise<AtomicOperationResult> {
  return serializeByBalance(
    `${input.userId}:${input.fromCurrency}`,
    () => executeAtomicOperationUnlocked(input),
  );
}

async function executeAtomicOperationUnlocked(
  input: AtomicOperationInput,
): Promise<AtomicOperationResult> {
  const client = await pool.connect();
  const requestHash = createHash('sha256')
    .update(JSON.stringify({ endpoint: input.endpoint, payload: input.rawPayload }))
    .digest('hex');
  let inTransaction = false;

  try {
    await client.query('BEGIN');
    inTransaction = true;

    const idempotency = await client.query<{
      request_hash: string;
      response_status: number;
      response_body: TransactionResponsePayload | string;
    }>(
      `SELECT request_hash, response_status, response_body
       FROM idempotency_keys
       WHERE user_id = $1 AND idempotency_key = $2
       FOR UPDATE`,
      [input.userId, input.idempotencyKey],
    );
    const cached = idempotency.rows[0];
    if (cached) {
      if (cached.request_hash !== requestHash) {
        throw new TransactionDomainError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'La clave de idempotencia ya se utilizó con otra solicitud.',
        );
      }

      await client.query('COMMIT');
      inTransaction = false;
      return {
        statusCode: cached.response_status,
        body: typeof cached.response_body === 'string'
          ? JSON.parse(cached.response_body) as TransactionResponsePayload
          : cached.response_body,
        isCached: true,
      };
    }

    const currencies = [input.fromCurrency, input.toCurrency].sort();
    const balancesResult = await client.query<{ currency: CurrencyCode; balance: string }>(
      `SELECT b.currency, b.amount::text AS balance
       FROM wallet_balances AS b
       JOIN wallets AS w ON w.id = b.wallet_id
       WHERE w.user_id = $1 AND b.currency = ANY($2::text[])
       ORDER BY b.currency
       FOR UPDATE OF b`,
      [input.userId, currencies],
    );
    const balances = new Map(
      balancesResult.rows.map((row) => [row.currency, row.balance]),
    );
    const currentBalance = balances.get(input.fromCurrency);

    if (!currentBalance || Number(currentBalance) < Number(input.amountDebited)) {
      throw new TransactionDomainError(
        422,
        'INSUFFICIENT_FUNDS',
        'Saldo insuficiente para realizar la operación.',
      );
    }

    const currentMinor = BigInt(currentBalance.replace('.', ''));
    const debitMinor = BigInt(input.amountDebited.replace('.', ''));
    const remainingMinor = currentMinor - debitMinor;
    const remainingAmount = `${remainingMinor / 100n}.${(remainingMinor % 100n).toString().padStart(2, '0')}`;

    await client.query(
      `UPDATE wallet_balances
       SET amount = $1::numeric
       WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = $2)
         AND currency = $3`,
      [remainingAmount, input.userId, input.fromCurrency],
    );
    await client.query(
      `UPDATE wallet_balances
       SET amount = amount + $1::numeric
       WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = $2)
         AND currency = $3`,
      [input.amountCredited, input.userId, input.toCurrency],
    );

    const transactionResult = await client.query<{ id: string }>(
      `INSERT INTO transactions (
         wallet_id, idempotency_key, endpoint, raw_payload, type,
         from_currency, to_currency, amount_debited, amount_credited, exchange_rate
       )
       SELECT w.id, $2, $3, $4::jsonb, $5, $6, $7, $8::numeric, $9::numeric, $10::numeric
       FROM wallets AS w
       WHERE w.user_id = $1
       RETURNING id`,
      [
        input.userId,
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
    const transactionId = transactionResult.rows[0]?.id;
    if (!transactionId) {
      throw new Error('No se pudo registrar la transacción.');
    }

    const body: TransactionResponsePayload = {
      transactionId,
      type: input.type,
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      amountDebited: input.amountDebited,
      amountCredited: input.amountCredited,
      exchangeRate: input.exchangeRate,
      status: 'completed',
    };

    await client.query(
      `INSERT INTO idempotency_keys (
         user_id, idempotency_key, request_hash, response_status, response_body
       ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [input.userId, input.idempotencyKey, requestHash, 201, JSON.stringify(body)],
    );
    await client.query('COMMIT');
    inTransaction = false;

    return { statusCode: 201, body, isCached: false };
  } catch (error) {
    if (inTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
}
