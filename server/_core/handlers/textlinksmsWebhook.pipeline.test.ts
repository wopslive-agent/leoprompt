import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Account, Conversation } from "../../../drizzle/schema";
import type { IntakeResult } from "../ai";

const mocks = vi.hoisted(() => ({
  verifyWebhookSecret: vi.fn(),
  sendSms: vi.fn(),
  runIntake: vi.fn(),
  getDefaultAccount: vi.fn(),
  getOrCreateConversationForInboundWebhook: vi.fn(),
  updateConversation: vi.fn(),
  getMessagesByConversation: vi.fn(),
  createMessage: vi.fn(),
  createLeadLog: vi.fn(),
  createNotification: vi.fn(),
  createFollowUpJob: vi.fn(),
  cancelFollowUpJobsForConversation: vi.fn(),
}));

vi.mock("../textlinksms", () => ({
  verifyWebhookSecret: mocks.verifyWebhookSecret,
  sendSms: mocks.sendSms,
}));

vi.mock("../ai", async () => {
  const actual = await vi.importActual<typeof import("../ai")>("../ai");
  return {
    ...actual,
    runIntake: mocks.runIntake,
  };
});

vi.mock("../../db", () => ({
  getDefaultAccount: mocks.getDefaultAccount,
  getOrCreateConversationForInboundWebhook:
    mocks.getOrCreateConversationForInboundWebhook,
  updateConversation: mocks.updateConversation,
  getMessagesByConversation: mocks.getMessagesByConversation,
  createMessage: mocks.createMessage,
  createLeadLog: mocks.createLeadLog,
  createNotification: mocks.createNotification,
  createFollowUpJob: mocks.createFollowUpJob,
  cancelFollowUpJobsForConversation: mocks.cancelFollowUpJobsForConversation,
}));

const { handleTextLinkSmsWebhook } = await import("./textlinksmsWebhook");

function createAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    userId: 2,
    businessName: "Pipeline Test Co",
    servicesOffered: "Booking intake",
    pricing: null,
    availability: null,
    aiPersona: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    plan: "starter",
    active: true,
    notificationEmail: null,
    twilioPhoneNumber: "+15551230000",
    calendlyUrl: null,
    whatsappPhoneNumber: null,
    followUpEnabled: false,
    googleCalendarId: null,
    googleCalendarAccessToken: null,
    googleCalendarRefreshToken: null,
    onboardingComplete: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createConversation(
  overrides: Partial<Conversation> = {}
): Conversation {
  return {
    id: 10,
    accountId: 1,
    customerPhone: "+15559870000",
    channel: "sms",
    status: "new",
    currentState: null,
    riskFlags: null,
    handoffReason: null,
    rejectionReason: null,
    shouldHandoff: false,
    shouldReject: false,
    lastUserMessageAt: null,
    lastAgentMessageAt: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createIntake(overrides: Partial<IntakeResult> = {}): IntakeResult {
  return {
    replyText: "Thanks, I can help with that.",
    status: "collecting_details",
    nextAction: "ask_for_missing_fields",
    shouldSendReply: true,
    shouldHandoff: false,
    shouldReject: false,
    missingFields: [],
    extractedFields: {},
    riskFlags: ["none"],
    handoffReason: "none",
    rejectionReason: "none",
    confidence: { overall: 0.9 },
    ...overrides,
  };
}

function createReq(body: Record<string, unknown>): Request {
  return {
    body,
    headers: {},
    protocol: "https",
    originalUrl: "/api/webhook/textlinksms",
    get: vi.fn(() => "app.example.com"),
  } as unknown as Request;
}

function createRes() {
  const res = {
    set: vi.fn(() => res),
    status: vi.fn(() => res),
    send: vi.fn(() => res),
    json: vi.fn(() => res),
  } as unknown as Response & {
    set: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  return res;
}

function inboundBody(text: string, overrides: Record<string, unknown> = {}) {
  return {
    secret: "valid",
    phone_number: "+15559870000",
    text,
    ...overrides,
  };
}

describe("TextLinkSMS webhook pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyWebhookSecret.mockReturnValue(true);
    mocks.getDefaultAccount.mockResolvedValue(createAccount());
    mocks.getMessagesByConversation.mockResolvedValue([]);
    mocks.createMessage.mockResolvedValue({});
    mocks.createLeadLog.mockResolvedValue({ id: 55 });
    mocks.createNotification.mockResolvedValue({});
    mocks.updateConversation.mockResolvedValue(undefined);
    mocks.cancelFollowUpJobsForConversation.mockResolvedValue(undefined);
    mocks.sendSms.mockResolvedValue(undefined);
  });

  it("rejects requests with an invalid secret with 403", async () => {
    mocks.verifyWebhookSecret.mockReturnValue(false);
    const res = createRes();
    await handleTextLinkSmsWebhook(createReq(inboundBody("Hello")), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.getDefaultAccount).not.toHaveBeenCalled();
    expect(mocks.runIntake).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("runs the happy path: AI reply is sent and 200 ok is returned", async () => {
    mocks.getOrCreateConversationForInboundWebhook.mockResolvedValue({
      allowed: true,
      conversation: createConversation(),
      gate: {
        allowed: true,
        reason: "existing_conversation",
        blockReason: null,
        customerMessage: null,
        plan: "starter",
        monthlyConversationLimit: 100,
        currentMonthlyConversations: 1,
        isExistingConversation: false,
        requiresNewConversationSlot: true,
      },
    });
    mocks.runIntake.mockResolvedValue(
      createIntake({ replyText: "Got it, what date?" })
    );

    const res = createRes();
    await handleTextLinkSmsWebhook(
      createReq(inboundBody("I want to book")),
      res
    );

    expect(mocks.runIntake).toHaveBeenCalled();
    expect(mocks.sendSms).toHaveBeenCalledWith(
      "+15559870000",
      "Got it, what date?"
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("blocks over-limit conversations before persistence and AI", async () => {
    mocks.getOrCreateConversationForInboundWebhook.mockResolvedValue({
      allowed: false,
      gate: {
        allowed: false,
        reason: "monthly_conversation_limit_reached",
        blockReason: "monthly_conversation_limit_reached",
        customerMessage: "Plan limit reached.",
        plan: "starter",
        monthlyConversationLimit: 100,
        currentMonthlyConversations: 100,
        isExistingConversation: false,
        requiresNewConversationSlot: false,
      },
    });

    const res = createRes();
    await handleTextLinkSmsWebhook(createReq(inboundBody("Hello")), res);

    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.runIntake).not.toHaveBeenCalled();
    expect(mocks.sendSms).toHaveBeenCalledWith(
      "+15559870000",
      "Plan limit reached."
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
