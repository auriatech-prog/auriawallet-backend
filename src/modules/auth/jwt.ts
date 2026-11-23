import { errors, jwtVerify, SignJWT } from 'jose';
import { env } from '../../config/env.js';

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

function signingKey(): Buffer {
  const secret = env.jwtSecret;

  if (!secret || !/^[a-f0-9]{64}$/iu.test(secret)) {
    throw new Error('JWT_SECRET debe contener 64 caracteres hexadecimales');
  }

  return Buffer.from(secret, 'hex');
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(signingKey());
}

export async function verifyAccessToken(token: string): Promise<string | undefined> {
  const key = signingKey();

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      typ: 'JWT',
      requiredClaims: ['sub', 'exp'],
    });

    if (payload.sub && uuidPattern.test(payload.sub)) {
      return payload.sub;
    }

    return undefined;
  } catch (error) {
    if (error instanceof errors.JOSEError) {
      return undefined;
    }

    throw error;
  }
}
