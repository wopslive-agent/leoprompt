import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Account } from "../../drizzle/schema";
import { AIParseError, runIntake, STATIC_FALLBACK_REPLY } from "./ai";

const anthropicMock = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: anthropicMock.create,
    },
  })),
}));

const account: Account = {
  id: 1,
  userId: 1,
  businessName: "Elegant Events",
  servicesOffered: "Wedding coordination, corporate events",
  pricing: "Starting at $500",
  availability: "Weekdays and weekends",
  aiPersona: "Warm, concise, and professional.",
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

describe("AI intake engine", () => {
  beforeEach(() => {
    anthropicMock.create.mockReset();
  });

  it("forces the record_intent tool and maps structured V3 output", async () => {
    anthropicMock.create.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "record_intent",
          input: {
            reply_text: "Great, what date works best?",
            status: "collecting_details",
            next_action: "ask_for_missing_fields",
            should_send_reply: true,
            should_handoff: false,
            should_reject: false,
            missing_fields: ["event_date", "full_address"],
            ask_for_fields: ["event_date"],
            extracted_fields: {
              first_name: "Sam",
              booking_type: "bachelor_party",
              guest_count: "10",
            },
            risk_flags: ["none"],
            handoff_reason: "none",
            rejection_reason: "none",
            confidence: { overall: 0.91, by_field: { first_name: 0.99 } },
            notes_for_manager: "Strong lead",
          },
        },
      ],
    });

    const result = await runIntake(
      account,
      [{ role: "assistant", content: "Hi, how can I help?" }],
      "Hi I need a bachelor party booking."
    );

    expect(anthropicMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5-20251001",
        tool_choice: { type: "tool", name: "record_intent" },
        tools: [expect.objectContaining({ name: "record_intent" })],
        messages: [
          { role: "assistant", content: "Hi, how can I help?" },
          { role: "user", content: "Hi I need a bachelor party booking." },
        ],
      })
    );

    expect(result).toMatchObject({
      replyText: "Great, what date works best?",
      status: "collecting_details",
      nextAction: "ask_for_missing_fields",
      shouldSendReply: true,
      shouldHandoff: false,
      shouldReject: false,
      missingFields: ["event_date", "full_address"],
      askForFields: ["event_date"],
      extractedFields: {
        firstName: "Sam",
        bookingType: "bachelor_party",
        guestCount: "10",
      },
      riskFlags: ["none"],
      handoffReason: "none",
      rejectionReason: "none",
      confidence: { overall: 0.91, byField: { first_name: 0.99 } },
      notesForManager: "Strong lead",
    });
  });

  it("uses fallback values when optional tool fields are missing", async () => {
    anthropicMock.create.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "record_intent",
          input: {
            reply_text: "",
            status: "new",
            next_action: "wait_for_user",
            should_send_reply: true,
            should_handoff: false,
            should_reject: false,
            missing_fields: [],
            extracted_fields: {},
            risk_flags: ["none"],
            handoff_reason: "none",
            rejection_reason: "none",
            confidence: { overall: 0.5 },
          },
        },
      ],
    });

    const result = await runIntake(account, [], "Hello");

    expect(result).toMatchObject({
      replyText: STATIC_FALLBACK_REPLY,
      nextAction: "wait_for_user",
      shouldSendReply: true,
      missingFields: [],
      riskFlags: ["none"],
      handoffReason: "none",
      rejectionReason: "none",
      confidence: { overall: 0.5 },
    });
  });

  it("throws AIParseError when Anthropic fails", async () => {
    const cause = new Error("network down");
    anthropicMock.create.mockRejectedValue(cause);

    await expect(runIntake(account, [], "Hi")).rejects.toMatchObject({
      name: "AIParseError",
      message: "Anthropic API call failed",
      raw: cause,
    });
  });

  it("throws AIParseError when the model does not call the tool", async () => {
    anthropicMock.create.mockResolvedValue({
      content: [{ type: "text", text: "Plain text response" }],
    });

    await expect(runIntake(account, [], "Hi")).rejects.toBeInstanceOf(AIParseError);
    await expect(runIntake(account, [], "Hi")).rejects.toMatchObject({
      message: "Model did not call record_intent",
    });
  });
});
