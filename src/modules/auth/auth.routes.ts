import { Router, type Response } from 'express';
import { requireAuth, type AuthLocals } from '../../middlewares/auth.middleware.js';
import { AppError } from '../../shared/errors/app-error.js';
import { createUserWithWallet, findOrCreateGoogleUser, findUserByEmail, findUserProfileById } from './auth.repository.js';
import { validateLoginInput, validateRegisterInput } from './auth.schema.js';
import {
  createGoogleLogin,
  getGoogleConfig,
  googleCallbackPath,
  googleFlowCookie,
  verifyGoogleLogin,
} from './google.service.js';
import { consumeGoogleLoginCode, issueGoogleLoginCode } from './google-login-code.js';
import { signAccessToken } from './jwt.js';
import { hashPassword, verifyPassword } from './password.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { name, email, password } = validateRegisterInput(req.body);
  const passwordHash = await hashPassword(password);
  const user = await createUserWithWallet({ name, email, passwordHash });

  res.status(201).json({ user });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = validateLoginInput(req.body);
  const user = await findUserByEmail(email);
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? undefined);

  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales incorrectas');
  }

  res.status(200).json(await createSession(user));
});

authRouter.get('/me', requireAuth, async (_req, res: Response<unknown, AuthLocals>) => {
  const user = await findUserProfileById(res.locals.userId);

  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado');
  }

  res.status(200).json(user);
});

async function createSession(user: { id: string; name: string; email: string }) {
  return {
    accessToken: await signAccessToken(user.id),
    tokenType: 'Bearer',
    user: { id: user.id, name: user.name, email: user.email },
  };
}

function googleCookieOptions(callbackUrl: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: new URL(callbackUrl).protocol === 'https:',
    path: googleCallbackPath,
  };
}

authRouter.get('/google', async (req, res) => {
  const config = getGoogleConfig();
  const challenge = req.query.code_challenge;
  if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(challenge)) {
    throw new AppError(400, 'INVALID_GOOGLE_CHALLENGE', 'Falta el desafío de seguridad del navegador');
  }
  const { cookie, url } = await createGoogleLogin(config, challenge);

  res.set('Cache-Control', 'no-store');
  res.cookie(googleFlowCookie, cookie, { ...googleCookieOptions(config.callbackUrl), maxAge: 600_000 });
  res.redirect(url);
});

authRouter.get('/google/callback', async (req, res) => {
  const config = getGoogleConfig();
  const { code, state } = req.query;
  const cookie = req.get('cookie')?.split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(googleFlowCookie + '='))
    ?.slice(googleFlowCookie.length + 1);

  res.set('Cache-Control', 'no-store');
  res.clearCookie(googleFlowCookie, googleCookieOptions(config.callbackUrl));
  if (typeof code !== 'string' || !code || typeof state !== 'string' || !state || !cookie) {
    throw new AppError(400, 'INVALID_GOOGLE_CALLBACK', 'La respuesta de Google está incompleta o se canceló');
  }

  const identity = await verifyGoogleLogin(config, cookie, state, code);
  const user = await findOrCreateGoogleUser(identity);
  const loginCode = await issueGoogleLoginCode(user.id, identity.frontendChallenge);
  config.frontendCallbackUrl.hash = new URLSearchParams({ code: loginCode }).toString();
  res.redirect(config.frontendCallbackUrl.toString());
});

authRouter.post('/google/exchange', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { code, codeVerifier } = req.body ?? {};
  if (
    typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(code) ||
    typeof codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/u.test(codeVerifier)
  ) {
    throw new AppError(400, 'INVALID_GOOGLE_EXCHANGE', 'El código o el verificador no tiene un formato válido');
  }

  const userId = await consumeGoogleLoginCode(code, codeVerifier);
  const user = userId ? await findUserProfileById(userId) : undefined;
  if (!user) {
    throw new AppError(401, 'INVALID_GOOGLE_LOGIN_CODE', 'El código no es válido o venció');
  }

  res.status(200).json(await createSession(user));
});
