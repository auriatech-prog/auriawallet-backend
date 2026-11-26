import { z } from "zod";

export const chatMessageSchema = z.object({
  message: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "El campo 'message' es obligatorio."
          : "El campo 'message' debe ser una cadena de texto.",
    })
    .trim()
    .min(1, "El mensaje no puede estar vacío.")
    .max(1000, "El mensaje no puede superar los 1000 caracteres."),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;