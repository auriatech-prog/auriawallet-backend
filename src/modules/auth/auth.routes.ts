import { Router } from 'express';
import { createUserWithWallet } from './auth.repository.js';
import { validateRegisterInput } from './auth.schema.js';
import { hashPassword } from './password.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { name, email, password } = validateRegisterInput(req.body);
  const passwordHash = await hashPassword(password);
  const user = await createUserWithWallet({ name, email, passwordHash });

  res.status(201).json({ user });
});
