import type { SupportedCurrency } from '../../config/currencies.js';
import { pool } from '../../config/database.js';

interface WalletBalance {
  currency: SupportedCurrency;
  amount: string;
}

export async function findBalancesByUserId(userId: string): Promise<WalletBalance[]> {
  const { rows } = await pool.query<WalletBalance>(
    `SELECT b.currency, b.amount::text AS amount
     FROM wallets AS w
     JOIN wallet_balances AS b ON b.wallet_id = w.id
     WHERE w.user_id = $1
     ORDER BY b.currency`,
    [userId],
  );

  return rows;
}
