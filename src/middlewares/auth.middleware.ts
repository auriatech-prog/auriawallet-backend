import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../modules/auth/jwt.js';
import { AppError } from '../shared/errors/app-error.js';

export interface AuthLocals {
  userId: string;
}

export async function requireAuth(
  req: Request,
  res: Response<unknown, AuthLocals>,
  next: NextFunction,
): Promise<void> {
  const token = req.get('authorization')?.match(/^Bearer +([^\s]+)$/iu)?.[1];
  const userId = token ? await verifyAccessToken(token) : undefined;

  if (!userId) {
    res.set('WWW-Authenticate', 'Bearer');
    throw new AppError(401, 'UNAUTHORIZED', 'Token de acceso ausente o inválido');
  }

  res.locals.userId = userId;
  next();
}
