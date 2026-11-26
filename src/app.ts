import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requireAuth } from './middlewares/auth.middleware.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { chatRouter } from './modules/chat/chat.routes.js';
import { exchangeRatesRouter } from './modules/exchange-rates/exchange-rates.routes.js';
import { walletsRouter } from './modules/wallets/wallets.routes.js';
import { AppError } from './shared/errors/app-error.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);
app.use('/api/wallet', walletsRouter);
app.use('/api/exchange-rates', requireAuth, exchangeRatesRouter);

app.use((_req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', 'Ruta no encontrada'));
});
app.use(errorMiddleware);
