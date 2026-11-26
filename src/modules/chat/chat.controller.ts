import type { Request, Response } from "express";
import { ZodError } from "zod";
import { chatMessageSchema } from "./chat.schema.js";
import { chatService, ChatServiceError } from "./chat.service.js";

export async function postChatMessage(req: Request, res: Response): Promise<Response> {
  try {
    const userId = res.locals.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Token de autenticación requerido." },
      });
    }

    const { message } = chatMessageSchema.parse(req.body);
    const result = await chatService.askAssistant(userId, message);

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: firstIssue ? firstIssue.message : "Mensaje inválido.",
        },
      });
    }

    if (error instanceof ChatServiceError) {
      return res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    console.error("[ChatController] Error inesperado:", error);
    return res.status(503).json({
      error: {
        code: "CHAT_SERVICE_UNAVAILABLE",
        message: "El asistente no se encuentra disponible temporalmente.",
      },
    });
  }
}