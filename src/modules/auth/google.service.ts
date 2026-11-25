import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, EncryptJWT, errors, jwtDecrypt, jwtVerify } from 'jose';
import { AppError } from '../../shared/errors/app-error.js';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const flowAudience = 'auriawallet-google-login';
export const googleFlowCookie = 'auria_google_flow';
export const googleCallbackPath = '/api/auth/google/callback';

export function getGoogleConfig() {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_CALLBACK_URL: callbackUrl, GOOGLE_FRONTEND_CALLBACK_URL: frontendCallback } = process.env;

  if (!clientId || !clientSecret || !callbackUrl || !frontendCallback) {
    throw new AppError(503, 'GOOGLE_LOGIN_UNAVAILABLE', 'El inicio de sesión con Google no está configurado');
  }

  const frontendCallbackUrl = new URL(frontendCallback);
  const isLocalHttp = frontendCallbackUrl.protocol === 'http:' && frontendCallbackUrl.hostname === 'localhost';
  if ((!isLocalHttp && frontendCallbackUrl.protocol !== 'https:') ||
    frontendCallbackUrl.username || frontendCallbackUrl.password) {
    throw new Error('GOOGLE_FRONTEND_CALLBACK_URL debe usar HTTPS o HTTP en localhost');
  }

  return {
    frontendCallbackUrl,
    clientId,
    clientSecret,
    callbackUrl,
    flowKey: createHash('sha256').update(flowAudience).update(clientSecret).digest(),
  };
}

type GoogleConfig = ReturnType<typeof getGoogleConfig>;

export async function createGoogleLogin(config: GoogleConfig, frontendChallenge: string) {
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const cookie = await new EncryptJWT({ state, nonce, verifier, frontendChallenge })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setAudience(flowAudience)
    .setExpirationTime('10m')
    .encrypt(config.flowKey);

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return { cookie, url: url.toString() };
}

export async function verifyGoogleLogin(
  config: GoogleConfig,
  cookie: string,
  state: string,
  code: string,
) {
  let flow;
  try {
    flow = (await jwtDecrypt(cookie, config.flowKey, {
      audience: flowAudience,
      requiredClaims: ['exp'],
    })).payload;
  } catch (error) {
    if (!(error instanceof errors.JOSEError)) throw error;
    throw new AppError(400, 'INVALID_GOOGLE_STATE', 'La sesión de Google no es válida o venció');
  }

  if (flow.state !== state || typeof flow.nonce !== 'string' || typeof flow.verifier !== 'string' ||
    typeof flow.frontendChallenge !== 'string') {
    throw new AppError(400, 'INVALID_GOOGLE_STATE', 'La sesión de Google no es válida o venció');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.callbackUrl,
      grant_type: 'authorization_code',
      code_verifier: flow.verifier,
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    throw new AppError(502, 'GOOGLE_TOKEN_EXCHANGE_FAILED', 'No se pudo completar la conexión con Google');
  });

  if (!response.ok) {
    throw new AppError(502, 'GOOGLE_TOKEN_EXCHANGE_FAILED', 'No se pudo completar la conexión con Google');
  }

  const token = await response.json() as { id_token?: unknown };
  if (typeof token.id_token !== 'string') {
    throw new AppError(502, 'GOOGLE_TOKEN_EXCHANGE_FAILED', 'Google no devolvió un token de identidad');
  }

  let identity;
  try {
    identity = (await jwtVerify(token.id_token, googleKeys, {
      algorithms: ['RS256'],
      audience: config.clientId,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      requiredClaims: ['exp', 'sub'],
    })).payload;
  } catch (error) {
    if (!(error instanceof errors.JOSEError)) throw error;
    throw new AppError(401, 'INVALID_GOOGLE_IDENTITY', 'No se pudo verificar la identidad de Google');
  }

  const email = typeof identity.email === 'string' ? identity.email.trim().toLowerCase() : '';
  if (identity.nonce !== flow.nonce || !identity.sub || !email || identity.email_verified !== true) {
    throw new AppError(401, 'INVALID_GOOGLE_IDENTITY', 'No se pudo verificar la identidad de Google');
  }

  return {
    frontendChallenge: flow.frontendChallenge,
    sub: identity.sub,
    email,
    name: typeof identity.name === 'string' && identity.name.trim() ? identity.name.trim() : email,
  };
}
