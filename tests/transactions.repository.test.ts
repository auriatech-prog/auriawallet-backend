import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockConnect } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  pool: { connect: mockConnect },
}));

import {
  executeAtomicOperation,
} from "../src/modules/transactions/transactions.repository.js";

const input = {
  userId: "user-1",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  endpoint: "POST /api/transactions/convert",
  rawPayload: { fromCurrency: "USD", toCurrency: "EUR", amount: "10.00" },
  type: "convert" as const,
  fromCurrency: "USD" as const,
  toCurrency: "EUR" as const,
  amountDebited: "10.00",
  amountCredited: "9.20",
  exchangeRate: "0.92",
};

describe("transaction repository idempotency and locking", () => {
  let query: ReturnType<typeof vi.fn>;
  let release: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    query = vi.fn();
    release = vi.fn();
    mockConnect.mockResolvedValue({ query, release });
  });

  it("replays the matching request even when JSONB object key order differs", async () => {
    const body = {
      transactionId: "tx-1",
      type: "convert" as const,
      fromCurrency: "USD" as const,
      toCurrency: "EUR" as const,
      amountDebited: "10.00",
      amountCredited: "9.20",
      exchangeRate: "0.92",
      createdAt: "2026-11-25T10:00:00.000Z",
    };
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: "tx-1",
          type: "convert",
          endpoint: input.endpoint,
          raw_payload: { amount: "10.00", toCurrency: "EUR", fromCurrency: "USD" },
          from_currency: "USD",
          to_currency: "EUR",
          amount_debited: "10.00",
          amount_credited: "9.20",
          exchange_rate: "0.92",
          created_at: new Date(body.createdAt),
        }],
      })
      .mockResolvedValueOnce({});

    const result = await executeAtomicOperation(input);

    expect(result).toEqual({ statusCode: 200, body, isCached: true });
    expect(query).toHaveBeenCalledTimes(4);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects reuse of an idempotency key with a different payload", async () => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: "tx-1",
          endpoint: input.endpoint,
          raw_payload: { ...input.rawPayload, amount: "11.00" },
        }],
      })
      .mockResolvedValueOnce({});

    await expect(executeAtomicOperation(input)).rejects.toMatchObject({
      statusCode: 409,
      code: "IDEMPOTENCY_CONFLICT",
    });
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("locks both currency balances in alphabetical order before applying changes", async () => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "wallet-1" }] })
      .mockResolvedValueOnce({
        rows: [
          { currency: "EUR", amount: "20.00" },
          { currency: "USD", amount: "30.00" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ amount: "20.00" }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: "tx-2", created_at: new Date() }] })
      .mockResolvedValueOnce({});

    const result = await executeAtomicOperation(input);
    const lockCall = query.mock.calls[4];

    expect(lockCall[0]).toContain("ORDER BY currency");
    expect(lockCall[0]).toContain("FOR UPDATE");
    expect(lockCall[1][1]).toEqual(["EUR", "USD"]);
    expect(result.statusCode).toBe(201);
    expect(release).toHaveBeenCalledOnce();
  });
});
