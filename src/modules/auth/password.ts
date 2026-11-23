import { randomBytes, scrypt } from 'node:crypto';

const keyLength = 64;
const scryptOptions = {
  N: 2 ** 17,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024,
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, scryptOptions, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });

  return [
    'scrypt',
    scryptOptions.N,
    scryptOptions.r,
    scryptOptions.p,
    salt.toString('hex'),
    key.toString('hex'),
  ].join('$');
}
