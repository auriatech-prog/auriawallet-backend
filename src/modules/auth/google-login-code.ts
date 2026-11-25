import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../../config/database.js';

export async function issueGoogleLoginCode(userId: string, challenge: string): Promise<string> {
  const code = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(code).digest('hex');

  await pool.query(
    `WITH expired AS (DELETE FROM google_login_codes WHERE expires_at <= now())
     INSERT INTO google_login_codes (code_hash, code_challenge, user_id, expires_at)
     VALUES ($1, $2, $3, now() + interval '2 minutes')`,
    [hash, challenge, userId],
  );

  return code;
}

export async function consumeGoogleLoginCode(code: string, verifier: string): Promise<string | undefined> {
  const hash = createHash('sha256').update(code).digest('hex');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const { rows: [login] } = await pool.query<{ user_id: string }>(
    `DELETE FROM google_login_codes
     WHERE code_hash = $1 AND code_challenge = $2 AND expires_at > now()
     RETURNING user_id`,
    [hash, challenge],
  );

  return login?.user_id;
}
