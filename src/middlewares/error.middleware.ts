import type { ErrorRequestHandler } from 'express';
import { AppError } from '../shared/errors/app-error.js';
import type { ApiErrorResponse } from '../shared/types/api.types.js';

export const errorMiddleware: ErrorRequestHandler<
  unknown, ApiErrorResponse, unknown, unknown
> = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError && error.isOperational) {
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  if (error instanceof SyntaxError && 'type' in error && error.type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'El cuerpo de la solicitud contiene JSON inválido' },
    });
    return;
  }

  if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'BODY_TOO_LARGE', message: 'El cuerpo de la solicitud supera el tamaño permitido' },
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' },
  });
};
