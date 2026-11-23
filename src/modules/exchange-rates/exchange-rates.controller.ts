// src/modules/exchange-rates/exchange-rates.controller.ts
import type { NextFunction, Request, Response } from 'express';
import { validateExchangeRateQuery } from './exchange-rates.schema.js';
import { exchangeRatesService } from './exchange-rates.service.js';

export async function getExchangeRatesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = validateExchangeRateQuery(req.query as Record<string, unknown>);
    const data = await exchangeRatesService.getExchangeRate(query);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}