import { Router, type Response } from 'express';
import { requireAuth, type AuthLocals } from '../../middlewares/auth.middleware.js';
import { AppError } from '../../shared/errors/app-error.js';
import { createUserWithWallet, findUserByEmail, findUserProfileById } from './auth.repository.js';
import { validateLoginInput, validateRegisterInput } from './auth.schema.js';
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
  const passwordMatches = await verifyPassword(password, user?.passwordHash);

  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales incorrectas');
  }

  res.status(200).json({
    accessToken: await signAccessToken(user.id),
    tokenType: 'Bearer',
    user: { id: user.id, name: user.name, email: user.email },
  });
});

authRouter.get('/me', requireAuth, async (_req, res: Response<unknown, AuthLocals>) => {
  const user = await findUserProfileById(res.locals.userId);

  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado');
  }

  res.status(200).json(user);
});
