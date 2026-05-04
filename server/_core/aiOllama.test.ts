/**
 * Tests for the Ollama adapter (runIntakeOllama).
 *
 * Mocks:
 *   - ./env  → aiProvider: "ollama"
 *   - global fetch → simulates Ollama /api/chat responses
 *
 * The Anthropic path is tested in ai.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Account } from "../../drizzle/schema";

// Mock ENV before importing ai.ts so the module sees aiProvider = "ollama"
vi.mock("./env", () => ({
  ENV: {
    anthropicApiKey: "",
    aiProvider: "ollama",
    ollamaBaseUrl: "http://127.0.0.1:11434",
    ollamaModel: "llama3.1:8b",
  },
}));

// Import after mock is registered
import { runIntakeOllama, runIntake, STATIC_FALLBACK_REPLY, AIParseError } from "./ai";

// ── Fixtures ────────────────────────────────────────────────────────────────

const account: Account = {
  id: 1,
  userId: 1,
  businessName: "Vogue Entertainments",
  servicesOffered: "Private events, bachelor parties",
  pricing: "Starting at $800",
  availability: "Fri–Sun",
  aiPersona: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  plan: "trial",
  active: true,
  notificationEmail: null,
  twilioPhoneNumber: null,
  calendlyUrl: null,
  whatsappPhoneNumber: null,
  followUpEnabled: false,
  googleCalendarId: null,
  googleCalendarAccessToken: null,
  googleCalendarRefreshToken: null,
  onboardingComplete: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

/** Build a mock fetch that returns the given JSON string as Ollama's response. */
function mockOllamaFetch(jsonContent: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => `HTTP error ${status}`,
    json: async () => ({ message: { role: "assistant", content: jsonContent } }),
  });
}

const validOllamaPayload = JSON.stringify({
  reply_text: "Got it! What date are you thinking?",
  status: "collecting_details",
  next_action: "ask_for_missing_fields",
  should_send_reply: true,
  should_handoff: false,
  should_reject: false,
  missing_fields: ["event_date", "full_address"],
  ask_for_fields: ["event_date"],
  extracted_fields: { first_name: "Alex", booking_type: "bachelor_party", guest_count: "8" },
  risk_flags: ["none"],
  handoff_reason: "none",
  rejection_reason: "none",
  confidence: { overall: 0.88 },
  notes_for_manager: "Promising lead",
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Ollama intake adapter (runIntakeOllama)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /api/chat with format:json and maps structured output", async () => {
    vi.stubGlobal("fetch", mockOllamaFetch(validOllamaPayload));

    const result = await runIntakeOllama(
      account,
      [{ role: "assistant", content: "Hi, how can I help?" }],
      "I need a bachelor party booking."
    );

    // Verify fetch was called correctly
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("llama3.1:8b");
    expect(body.stream).toBe(false);
    expect(body.format).toBe("json");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[body.messages.length - 1]).toEqual({
      role: "user",
      content: "I need a bachelor party booking.",
    });

    // Verify output mapping
    expect(result).toMatchObject({
      replyText: "Got it! What date are you thinking?",
      status: "collecting_details",
      nextAction: "ask_for_missing_fields",
      shouldSendReply: true,
      shouldHandoff: false,
      shouldReject: false,
      missingFields: ["event_date", "full_address"],
      askForFields: ["event_date"],
      extractedFields: {
        firstName: "Alex",
        bookingType: "bachelor_party",
        guestCount: "8",
      },
      riskFlags: ["none"],
      handoffReason: "none",
      rejectionReason: "none",
      confidence: { overall: 0.88 },
      notesForManager: "Promising lead",
    });
  });

  it("retries and succeeds when first response is invalid JSON", async () => {
    const fetchMock = vi
      .fn()
      // First call returns garbage
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: "not valid json{{" } }),
      })
      // Second call returns valid JSON
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: validOllamaPayload } }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await runIntakeOllama(account, [], "Hello");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.replyText).toBe("Got it! What date are you thinking?");
  });

  it("throws AIParseError after exhausting all retries on persistent bad JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: "<<<not json>>>" } }),
      })
    );

    await expect(runIntakeOllama(account, [], "Hi")).rejects.toMatchObject({
      name: "AIParseError",
      message: "Ollama returned invalid JSON after retries",
    });
  });

  it("throws AIParseError when Ollama returns a non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
        json: async () => { throw new Error("no json"); },
      })
    );

    await expect(runIntakeOllama(account, [], "Hi")).rejects.toMatchObject({
      name: "AIParseError",
      message: "Ollama API call failed",
    });
  });

  it("throws AIParseError when fetch itself rejects (network down)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(runIntakeOllama(account, [], "Hi")).rejects.toMatchObject({
      name: "AIParseError",
      message: "Ollama API call failed",
    });
  });

  it("uses STATIC_FALLBACK_REPLY when reply_text is empty", async () => {
    const payload = JSON.stringify({
      reply_text: "",
      status: "new",
      next_action: "wait_for_user",
      should_send_reply: true,
      should_handoff: false,
      should_reject: false,
      missing_fields: [],
      ask_for_fields: [],
      extracted_fields: {},
      risk_flags: ["none"],
      handoff_reason: "none",
      rejection_reason: "none",
      confidence: { overall: 0.5 },
    });
    vi.stubGlobal("fetch", mockOllamaFetch(payload));

    const result = await runIntakeOllama(account, [], "Hello");
    expect(result.replyText).toBe(STATIC_FALLBACK_REPLY);
  });
});

describe("runIntake routing (ENV.aiProvider=ollama)", () => {
  it("delegates to Ollama when aiProvider is ollama", async () => {
    vi.stubGlobal("fetch", mockOllamaFetch(validOllamaPayload));

    const result = await runIntake(account, [], "Test message");
    expect(result.status).toBe("collecting_details");
    // fetch was called (Ollama path), not Anthropic
    expect(fetch).toHaveBeenCalled();
  });
});
