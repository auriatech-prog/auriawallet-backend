import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const scryptOptions = {
  N: 2 ** 17,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024,
};

const hashPrefix = ['scrypt', scryptOptions.N, scryptOptions.r, scryptOptions.p].join('$');

// Keep the scrypt work comparable when no account matches the email.
const dummyHash = [hashPrefix, '0'.repeat(32), '0'.repeat(128)].join('$');

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, scryptOptions, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);

  return [hashPrefix, salt.toString('hex'), key.toString('hex')].join('$');
}

export async function verifyPassword(password: string, storedHash?: string): Promise<boolean> {
  const [algorithm, N, r, p, salt, key, ...extra] = (storedHash ?? dummyHash).split('$');

  if (
    [algorithm, N, r, p].join('$') !== hashPrefix ||
    !salt || !/^[a-f0-9]{32}$/u.test(salt) ||
    !key || !/^[a-f0-9]{128}$/u.test(key) ||
    extra.length !== 0
  ) {
    return false;
  }

  const derivedKey = await deriveKey(password, Buffer.from(salt, 'hex'));
  const matches = timingSafeEqual(derivedKey, Buffer.from(key, 'hex'));
  return storedHash !== undefined && matches;
}
