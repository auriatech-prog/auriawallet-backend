import { Router, type Response } from 'express';
import { requireAuth, type AuthLocals } from '../../middlewares/auth.middleware.js';
import { findBalancesByUserId } from './wallets.repository.js';

export const walletsRouter = Router();

walletsRouter.get('/balances', requireAuth, async (_req, res: Response<unknown, AuthLocals>) => {
  const balances = await findBalancesByUserId(res.locals.userId);
  res.status(200).json({ balances });
});
