import type { Request, Response } from "express";
import { ZodError } from "zod";
import { TransactionDomainError } from "./transactions.repository.js";
import {
  buyTransactionSchema,
  convertTransactionSchema,
  idempotencyHeaderSchema,
  listTransactionsQuerySchema,
  sellTransactionSchema,
} from "./transactions.schema.js";
import { transactionsService } from "./transactions.service.js";

export function handleControllerError(res: Response, error: unknown): Response {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: firstIssue ? firstIssue.message : "Parámetros de solicitud inválidos.",
      },
    });
  }

  if (error instanceof TransactionDomainError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  console.error("[TransactionsController] Error inesperado:", error);
  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Ocurrió un error interno al procesar la transacción.",
    },
  });
}

export async function postBuyTransaction(req: Request, res: Response): Promise<Response> {
  try {
    const userId = res.locals.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Token de autenticación requerido." },
      });
    }

    const headers = idempotencyHeaderSchema.parse(req.headers);
    const body = buyTransactionSchema.parse(req.body);

    const result = await transactionsService.buyCurrency(
      userId,
      headers["idempotency-key"],
      body
    );

    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function postSellTransaction(req: Request, res: Response): Promise<Response> {
  try {
    const userId = res.locals.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Token de autenticación requerido." },
      });
    }

    const headers = idempotencyHeaderSchema.parse(req.headers);
    const body = sellTransactionSchema.parse(req.body);

    const result = await transactionsService.sellCurrency(
      userId,
      headers["idempotency-key"],
      body
    );

    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function postConvertTransaction(req: Request, res: Response): Promise<Response> {
  try {
    const userId = res.locals.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Token de autenticación requerido." },
      });
    }

    const headers = idempotencyHeaderSchema.parse(req.headers);
    const body = convertTransactionSchema.parse(req.body);

    const result = await transactionsService.convertCurrency(
      userId,
      headers["idempotency-key"],
      body
    );

    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function getTransactions(req: Request, res: Response): Promise<Response> {
  try {
    const userId = res.locals.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Token de autenticación requerido." },
      });
    }

    const { limit, offset } = listTransactionsQuerySchema.parse(req.query);
    const history = await transactionsService.getTransactionsHistory(userId, limit, offset);

    return res.status(200).json(history);
  } catch (error) {
    return handleControllerError(res, error);
  }
}