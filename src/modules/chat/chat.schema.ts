import { z } from "zod";

export const chatMessageSchema = z.object({
  message: z
    .string({
      required_error: "El campo 'message' es obligatorio.",
      invalid_type_error: "El campo 'message' debe ser una cadena de texto.",
    })
    .trim()
    .min(1, "El mensaje no puede estar vacío.")
    .max(1000, "El mensaje no puede superar los 1000 caracteres."),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;