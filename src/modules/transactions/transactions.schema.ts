import { z } from "zod";

const POSITIVE_MONEY_REGEX = /^\d+(\.\d{1,2})?$/;

// Validación reutilizable para montos en string (ej. "100.00")
const moneyStringSchema = z
  .string({
    error: (issue) =>
      issue.input === undefined
        ? "El campo 'amount' es obligatorio."
        : "El campo 'amount' debe ser un string decimal (ej. '100.00').",
  })
  .regex(POSITIVE_MONEY_REGEX, "El monto debe ser un número positivo con hasta 2 decimales.")
  .refine((val) => parseFloat(val) > 0, {
    message: "El monto debe ser estrictamente mayor a 0.",
  });

// Header Idempotency-Key obligatorio en buy, sell y convert
export const idempotencyHeaderSchema = z.object({
  "idempotency-key": z
    .string({
      error: "El header 'Idempotency-Key' es obligatorio.",
    })
    .uuid("El header 'Idempotency-Key' debe ser un UUID válido."),
});

// Body para POST /api/transactions/buy (compra USD o EUR pagando con ARS)
export const buyTransactionSchema = z.object({
  currency: z.enum(["USD", "EUR"], {
    error: "Solo se permite comprar 'USD' o 'EUR'.",
  }),
  amount: moneyStringSchema,
});

// Body para POST /api/transactions/sell (vende USD o EUR recibiendo ARS)
export const sellTransactionSchema = z.object({
  currency: z.enum(["USD", "EUR"], {
    error: "Solo se permite vender 'USD' o 'EUR'.",
  }),
  amount: moneyStringSchema,
});

// Body para POST /api/transactions/convert (intercambio entre cualquier par distinto)
export const convertTransactionSchema = z
  .object({
    fromCurrency: z.enum(["ARS", "USD", "EUR"], {
      error: "Moneda de origen inválida. Use ARS, USD o EUR.",
    }),
    toCurrency: z.enum(["ARS", "USD", "EUR"], {
      error: "Moneda de destino inválida. Use ARS, USD o EUR.",
    }),
    amount: moneyStringSchema,
  })
  .refine((data) => data.fromCurrency !== data.toCurrency, {
    message: "Las monedas de origen y destino deben ser diferentes.",
    path: ["toCurrency"],
  });

// Query params para GET /api/transactions
export const listTransactionsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, "El parámetro 'limit' debe ser al menos 1.")
    .max(100, "El parámetro 'limit' no puede superar 100.")
    .default(20),
  offset: z.coerce
    .number()
    .int()
    .min(0, "El parámetro 'offset' no puede ser negativo.")
    .default(0),
});

export type BuyTransactionInput = z.infer<typeof buyTransactionSchema>;
export type SellTransactionInput = z.infer<typeof sellTransactionSchema>;
export type ConvertTransactionInput = z.infer<typeof convertTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;