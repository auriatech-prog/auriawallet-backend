import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../../config/currencies.js';
import { pool } from '../../config/database.js';
import { AppError } from '../../shared/errors/app-error.js';

const INITIAL_DEMO_BALANCES = {
  USD: '100.00',
  EUR: '100.00',
  ARS: '1000000.00',
} satisfies Record<SupportedCurrency, string>;

type NewUser = { name: string; email: string } & (
  { passwordHash: string } | { googleSub: string }
);

interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export async function createUserWithWallet(input: NewUser): Promise<PublicUser> {
  const { name, email } = input;
  const client = await pool.connect();
  let discardClient = false;

  try {
    await client.query('BEGIN');
    const { rows: [user] } = 'googleSub' in input
      ? await client.query<PublicUser>(
        `INSERT INTO users (name, email, google_sub)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, created_at AS "createdAt"`,
        [name, email, input.googleSub],
      )
      : await client.query<PublicUser>(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, created_at AS "createdAt"`,
        [name, email, input.passwordHash],
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

interface UserCredentials {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
}

export async function findUserByEmail(email: string): Promise<UserCredentials | undefined> {
  const { rows: [user] } = await pool.query<UserCredentials>(
    `SELECT id, name, email, password_hash AS "passwordHash"
     FROM users
     WHERE lower(email) = $1`,
    [email],
  );

  return user;
}

export async function findUserProfileById(id: string): Promise<PublicUser | undefined> {
  const { rows: [user] } = await pool.query<PublicUser>(
    `SELECT id, name, email, created_at AS "createdAt"
     FROM users
     WHERE id = $1`,
    [id],
  );

  return user;
}

async function findUserByGoogleSub(sub: string): Promise<PublicUser | undefined> {
  const { rows: [user] } = await pool.query<PublicUser>(
    `SELECT id, name, email, created_at AS "createdAt"
     FROM users WHERE google_sub = $1`,
    [sub],
  );

  return user;
}

export async function findOrCreateGoogleUser(identity: {
  sub: string;
  email: string;
  name: string;
}): Promise<PublicUser> {
  const existingUser = await findUserByGoogleSub(identity.sub);
  if (existingUser) return existingUser;

  try {
    return await createUserWithWallet({
      googleSub: identity.sub,
      email: identity.email,
      name: identity.name,
    });
  } catch (error) {
    const emailTaken = error instanceof AppError && error.code === 'EMAIL_ALREADY_REGISTERED';
    const googleSubTaken = error instanceof Error &&
      'code' in error && error.code === '23505' &&
      'constraint' in error && error.constraint === 'users_google_sub_key';

    if (emailTaken || googleSubTaken) {
      const concurrentUser = await findUserByGoogleSub(identity.sub);
      if (concurrentUser) return concurrentUser;
    }

    throw error;
  }
}
