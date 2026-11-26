import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addMoney,
  hasEnoughFunds,
  multiplyMoney,
  subtractMoney,
  toMoneyString,
  toRateString,
} from "../src/shared/utils/decimal.js";

// 1. Mock del pool de PostgreSQL
const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();

vi.mock("../src/database/db.js", () => ({
  pool: {
    connect: () => mockConnect(),
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// 2. Mock del servicio de tasas de cambio del Sprint 1
vi.mock("../src/modules/exchange-rates/exchange-rates.service.js", () => ({
  getExchangeRates: vi.fn().mockResolvedValue({
    rates: {
      USD: { ARS: "1500.00", EUR: "0.92" },
      EUR: { ARS: "1600.00", USD: "1.0869565217" },
    },
  }),
}));

import { generateChatReply } from "../src/modules/chat/chat.provider.js";
import { TransactionDomainError } from "../src/modules/transactions/transactions.repository.js";
import { transactionsService } from "../src/modules/transactions/transactions.service.js";

describe("Sprint 2 — Precisión Decimal, Transacciones Atómicas y Chat Fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    });
  });

  // =========================================================================
  // 1. PRUEBAS DE ARITMÉTICA DECIMAL EXACTA
  // =========================================================================
  describe("Utilidad Decimal (decimal.ts)", () => {
    it("evita errores clásicos de punto flotante en sumas y multiplicaciones", () => {
      expect(addMoney("0.10", "0.20")).toBe("0.30");
      expect(multiplyMoney("100.00", "1500.00")).toBe("150000.00");
      expect(subtractMoney("150000.00", "149999.99")).toBe("0.01");
      expect(toRateString(1 / 1500)).toBe("0.0006666667");
    });

    it("valida correctamente fondos suficientes", () => {
      expect(hasEnoughFunds("100.00", "100.00")).toBe(true);
      expect(hasEnoughFunds("99.99", "100.00")).toBe(false);
    });
  });

  // =========================================================================
  // 2. PRUEBAS DE TRANSACCIONES ATÓMICAS E IDEMPOTENCIA
  // =========================================================================
  describe("Operaciones Atómicas (buy / sell / convert)", () => {
    it("ejecuta compra de USD (201), bloquea en orden alfabético y retorna campos exactos", async () => {
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // idempotency_keys -> no existe
        .mockResolvedValueOnce({
          // wallet_balances FOR UPDATE
          rows: [
            { currency: "ARS", balance: "200000.00" },
            { currency: "USD", balance: "10.00" },
          ],
        })
        .mockResolvedValueOnce({}) // UPDATE ARS
        .mockResolvedValueOnce({}) // UPDATE USD
        .mockResolvedValueOnce({ rows: [{ id: "tx-uuid-123" }] }) // INSERT transactions
        .mockResolvedValueOnce({}) // INSERT idempotency_keys
        .mockResolvedValueOnce({}); // COMMIT

      const result = await transactionsService.buyCurrency(
        "user-1",
        "11111111-1111-4111-8111-111111111111",
        { currency: "USD", amount: "100.00" }
      );

      expect(result.statusCode).toBe(201);
      expect(result.isCached).toBe(false);
      expect(result.body).toEqual({
        transactionId: "tx-uuid-123",
        type: "buy",
        fromCurrency: "ARS",
        toCurrency: "USD",
        amountDebited: "150000.00",
        amountCredited: "100.00",
        exchangeRate: "0.0006666667",
        status: "completed",
      });

      // Verifica que el bloqueo FOR UPDATE recibió las monedas ordenadas alfabéticamente
      const lockCall = mockQuery.mock.calls[2];
      expect(lockCall[1][1]).toEqual(["ARS", "USD"]);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("rechaza con 422 INSUFFICIENT_FUNDS y ejecuta ROLLBACK cuando no alcanza el saldo", async () => {
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // idempotency_keys
        .mockResolvedValueOnce({
          rows: [
            { currency: "ARS", balance: "50000.00" }, // Insuficiente para 150,000.00
            { currency: "USD", balance: "0.00" },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        transactionsService.buyCurrency(
          "user-1",
          "22222222-2222-4222-8222-222222222222",
          { currency: "USD", amount: "100.00" }
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "INSUFFICIENT_FUNDS",
      });

      expect(mockQuery).toHaveBeenLastCalledWith("ROLLBACK");
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("retorna respuesta cacheada en reintento idéntico y lanza 409 si cambia el payload", async () => {
      const crypto = await import("node:crypto");
      const samePayloadHash = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            endpoint: "POST /api/transactions/sell",
            payload: { currency: "EUR", amount: "50.00" },
          })
        )
        .digest("hex");

      const cachedResponse = {
        transactionId: "tx-cached-999",
        type: "sell" as const,
        fromCurrency: "EUR" as const,
        toCurrency: "ARS" as const,
        amountDebited: "50.00",
        amountCredited: "80000.00",
        exchangeRate: "1600.00",
        status: "completed" as const,
      };

      // Caso A: Reintento con exactamente el mismo payload -> devuelve 201 cacheado
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              request_hash: samePayloadHash,
              response_status: 201,
              response_body: cachedResponse,
            },
          ],
        })
        .mockResolvedValueOnce({}); // COMMIT

      const retryResult = await transactionsService.sellCurrency(
        "user-1",
        "33333333-3333-4333-8333-333333333333",
        { currency: "EUR", amount: "50.00" }
      );

      expect(retryResult.isCached).toBe(true);
      expect(retryResult.body.transactionId).toBe("tx-cached-999");

      // Caso B: Misma clave pero distinto monto -> lanza 409 IDEMPOTENCY_CONFLICT
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              request_hash: samePayloadHash,
              response_status: 201,
              response_body: cachedResponse,
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        transactionsService.sellCurrency(
          "user-1",
          "33333333-3333-4333-8333-333333333333",
          { currency: "EUR", amount: "99.00" }
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "IDEMPOTENCY_CONFLICT",
      });
    });

    it("impide doble gasto bajo peticiones concurrentes con Promise.all", async () => {
      let currentUsdBalance = "100.00";

      // Simula serialización por bloqueo FOR UPDATE en PostgreSQL
      mockConnect.mockImplementation(async () => {
        const clientQuery = vi.fn(async (sql: string, params?: unknown[]) => {
          if (sql.includes("FROM idempotency_keys")) return { rows: [] };
          if (sql.includes("FROM wallet_balances")) {
            return {
              rows: [
                { currency: "EUR", balance: "0.00" },
                { currency: "USD", balance: currentUsdBalance },
              ],
            };
          }
          if (sql.startsWith("UPDATE wallet_balances") && params?.[2] === "USD") {
            currentUsdBalance = toMoneyString(params[0] as string);
          }
          if (sql.includes("INSERT INTO transactions")) {
            return { rows: [{ id: "tx-concurrent" }] };
          }
          return { rows: [] };
        });

        return { query: clientQuery, release: vi.fn() };
      });

      const results = await Promise.allSettled([
        transactionsService.convertCurrency(
          "user-1",
          "44444444-4444-4444-8444-444444444441",
          { fromCurrency: "USD", toCurrency: "EUR", amount: "80.00" }
        ),
        transactionsService.convertCurrency(
          "user-1",
          "44444444-4444-4444-8444-444444444442",
          { fromCurrency: "USD", toCurrency: "EUR", amount: "80.00" }
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        TransactionDomainError
      );
      expect(currentUsdBalance).toBe("20.00");
    });
  });

  // =========================================================================
  // 3. PRUEBAS DE ASISTENTE IA Y FALLBACK DETERMINISTA
  // =========================================================================
  describe("Asistente Chat (Gemini + Fallback)", () => {
    it("activa fallback determinista con source: 'fallback' si no hay GEMINI_API_KEY", async () => {
      delete process.env.GEMINI_API_KEY;

      const response = await generateChatReply("¿Cuál es mi saldo actual?", {
        balances: [
          { currency: "ARS", balance: "50000.00" },
          { currency: "USD", balance: "120.00" },
        ],
        recentTransactions: [],
      });

      expect(response.source).toBe("fallback");
      expect(response.reply).toContain("ARS: 50000.00");
      expect(response.reply).toContain("USD: 120.00");
    });
  });
});