// src/modules/exchange-rates/exchange-rates.routes.ts
import { Router } from 'express';
import { getExchangeRatesController } from './exchange-rates.controller.js';

export const exchangeRatesRouter = Router();
// GET /api/exchange-rates?from=USD&to=EUR
exchangeRatesRouter.get('/', getExchangeRatesController);