import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../../config/currencies.js';
import { pool } from '../../config/database.js';
import { AppError } from '../../shared/errors/app-error.js';

const INITIAL_DEMO_BALANCES = {
  USD: '100.00',
  EUR: '100.00',
  ARS: '1000000.00',
} satisfies Record<SupportedCurrency, string>;

interface NewUser {
  name: string;
  email: string;
  passwordHash: string;
}

interface RegisteredUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export async function createUserWithWallet({
  name,
  email,
  passwordHash,
}: NewUser): Promise<RegisteredUser> {
  const client = await pool.connect();
  let discardClient = false;

  try {
    await client.query('BEGIN');
    const { rows: [user] } = await client.query<RegisteredUser>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at AS "createdAt"`,
      [name, email, passwordHash],
    );

    if (!user) {
      throw new Error('El registro no devolvió el usuario creado');
    }

    const { rows: [wallet] } = await client.query<{ id: string }>(
      'INSERT INTO wallets (user_id) VALUES ($1) RETURNING id',
      [user.id],
    );

    if (!wallet) {
      throw new Error('El registro no devolvió la billetera creada');
    }

    await client.query(
      `INSERT INTO wallet_balances (wallet_id, currency, amount)
       SELECT $1, currency, amount
       FROM unnest($2::text[], $3::numeric[]) AS balances(currency, amount)`,
      [
        wallet.id,
        SUPPORTED_CURRENCIES,
        SUPPORTED_CURRENCIES.map((currency) => INITIAL_DEMO_BALANCES[currency]),
      ],
    );

    await client.query('COMMIT');
    return user;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discardClient = true;
    }

    if (
      error instanceof Error &&
      'code' in error && error.code === '23505' &&
      'constraint' in error && error.constraint === 'users_email_unique'
    ) {
      throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'El email ya está registrado');
    }

    throw error;
  } finally {
    client.release(discardClient);
  }
}
