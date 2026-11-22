import type { NextFunction, Request, Response } from 'express';
import { validateExchangeRateQuery } from './exchange-rates.schema.js';
import { resolveExchangeRate } from './exchange-rates.service.js';

export async function getExchangeRatesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { from, to } = validateExchangeRateQuery(req.query);
    const result = await resolveExchangeRate(from, to);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}