import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPoolQuery, mockGenerateReply } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockGenerateReply: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  pool: { query: mockPoolQuery },
}));

vi.mock("../src/modules/chat/chat.provider.js", () => ({
  generateChatReply: mockGenerateReply,
}));

import { ChatService } from "../src/modules/chat/chat.service.js";

describe("chat context formatting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ currency: "ARS", balance: "90071992547409.99" }],
      })
      .mockResolvedValueOnce({
        rows: [{
          type: "convert",
          from_currency: "USD",
          to_currency: "EUR",
          amount_debited: "10.00",
          amount_credited: "9.20",
          exchange_rate: "0.0006666667",
          created_at: new Date("2026-11-25T10:00:00.000Z"),
        }],
      });
    mockGenerateReply.mockResolvedValue({ reply: "ok", source: "fallback" });
  });

  it("preserves exact database decimals in the read-only assistant context", async () => {
    const service = new ChatService();
    await service.askAssistant("user-1", "consulta");

    expect(mockPoolQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("WHERE w.user_id = $1"),
      ["user-1"],
    );
    expect(mockGenerateReply).toHaveBeenCalledWith(
      "consulta",
      expect.objectContaining({
        balances: [{ currency: "ARS", balance: "90071992547409.99" }],
        recentTransactions: [{
          type: "convert",
          fromCurrency: "USD",
          toCurrency: "EUR",
          amountDebited: "10.00",
          amountCredited: "9.20",
          exchangeRate: "0.0006666667",
          createdAt: "2026-11-25T10:00:00.000Z",
        }],
      }),
    );
  });
});
