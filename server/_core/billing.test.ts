import { describe, expect, it } from "vitest";
import type { Account } from "../../drizzle/schema";
import {
  BILLING_PLANS,
  INBOUND_WEBHOOK_BILLING_BLOCK_MESSAGES,
  PLAN_MONTHLY_CONVERSATION_LIMITS,
  TRIAL_MONTHLY_CONVERSATION_LIMIT,
  canProcessInboundConversation,
  evaluateInboundWebhookBillingGate,
  getBillingPlan,
  getMonthlyConversationLimit,
} from "./billing";

const createAccount = (overrides: Partial<Account> = {}): Account => ({
  id: 1,
  userId: 1,
  businessName: "Demo Business",
  servicesOffered: null,
  pricing: null,
  availability: null,
  aiPersona: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  plan: "starter",
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
  ...overrides,
});

describe("billing plans", () => {
  it("defines the paid Stripe plan tiers", () => {
    expect(BILLING_PLANS.map(plan => [plan.id, plan.monthlyPrice])).toEqual([
      ["starter", 49],
      ["pro", 99],
      ["agency", 249],
    ]);
  });

  it("returns monthly limits for trial and paid plans", () => {
    expect(PLAN_MONTHLY_CONVERSATION_LIMITS).toEqual({
      trial: 25,
      starter: 100,
      pro: 500,
      agency: 2500,
    });
    expect(getMonthlyConversationLimit("trial")).toBe(
      TRIAL_MONTHLY_CONVERSATION_LIMIT
    );
    expect(getMonthlyConversationLimit("starter")).toBe(
      getBillingPlan("starter").monthlyConversationLimit
    );
    expect(getMonthlyConversationLimit("agency")).toBe(
      getBillingPlan("agency").monthlyConversationLimit
    );
  });

  it("rejects unknown runtime plan ids", () => {
    expect(() =>
      getMonthlyConversationLimit("enterprise" as Account["plan"])
    ).toThrow("Unknown billing plan: enterprise");
  });
});

describe("inbound webhook billing gate", () => {
  it("returns a stable allow decision for new conversations below limit", () => {
    const account = createAccount({ plan: "starter" });

    const result = evaluateInboundWebhookBillingGate({
      account,
      currentMonthlyConversations:
        getMonthlyConversationLimit(account.plan) - 1,
      isExistingConversation: false,
    });

    expect(result).toMatchObject({
      allowed: true,
      reason: "within_monthly_conversation_limit",
      blockReason: null,
      customerMessage: null,
      plan: "starter",
      monthlyConversationLimit: 100,
      requiresNewConversationSlot: true,
    });
  });

  it("hard-blocks new conversations at the monthly limit", () => {
    const account = createAccount({ plan: "pro" });

    const result = evaluateInboundWebhookBillingGate({
      account,
      currentMonthlyConversations: getMonthlyConversationLimit(account.plan),
      isExistingConversation: false,
    });

    expect(result).toMatchObject({
      allowed: false,
      reason: "monthly_conversation_limit_reached",
      blockReason: "monthly_conversation_limit_reached",
      customerMessage:
        INBOUND_WEBHOOK_BILLING_BLOCK_MESSAGES.monthly_conversation_limit_reached,
      monthlyConversationLimit: 500,
      requiresNewConversationSlot: false,
    });
  });

  it("hard-blocks new conversations above the monthly limit", () => {
    const account = createAccount({ plan: "agency" });

    const result = evaluateInboundWebhookBillingGate({
      account,
      currentMonthlyConversations:
        getMonthlyConversationLimit(account.plan) + 1,
      isExistingConversation: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockReason).toBe("monthly_conversation_limit_reached");
  });

  it("allows existing conversations after the monthly limit", () => {
    const account = createAccount({ plan: "starter" });

    const result = evaluateInboundWebhookBillingGate({
      account,
      currentMonthlyConversations:
        getMonthlyConversationLimit(account.plan) + 10,
      isExistingConversation: true,
    });

    expect(result).toMatchObject({
      allowed: true,
      reason: "existing_conversation",
      blockReason: null,
      customerMessage: null,
      requiresNewConversationSlot: false,
    });
  });

  it("blocks inactive accounts before allowing an existing conversation", () => {
    const account = createAccount({ active: false, plan: "starter" });

    const result = evaluateInboundWebhookBillingGate({
      account,
      currentMonthlyConversations:
        getMonthlyConversationLimit(account.plan) + 10,
      isExistingConversation: true,
    });

    expect(result).toMatchObject({
      allowed: false,
      reason: "account_inactive",
      blockReason: "account_inactive",
      customerMessage: INBOUND_WEBHOOK_BILLING_BLOCK_MESSAGES.account_inactive,
      requiresNewConversationSlot: false,
    });
  });
});

describe("billing usage gate", () => {
  it("allows new conversations while the account is active and below limit", () => {
    const account = createAccount({ plan: "starter" });

    const result = canProcessInboundConversation({
      account,
      currentMonthlyConversations:
        getMonthlyConversationLimit(account.plan) - 1,
      isExistingConversation: false,
    });

    expect(result.allowed).toBe(true);
  });

  it("blocks new conversations when the monthly limit has been reached", () => {
    const account = createAccount({ plan: "starter" });

    const result = canProcessInboundConversation({
      account,
      currentMonthlyConversations: getMonthlyConversationLimit(account.plan),
      isExistingConversation: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Monthly conversation limit reached");
  });

  it("allows existing conversations to continue after the limit is reached", () => {
    const account = createAccount({ plan: "starter" });

    const result = canProcessInboundConversation({
      account,
      currentMonthlyConversations: getMonthlyConversationLimit(account.plan),
      isExistingConversation: true,
    });

    expect(result.allowed).toBe(true);
  });

  it("blocks inactive accounts before checking usage", () => {
    const account = createAccount({ active: false, plan: "agency" });

    const result = canProcessInboundConversation({
      account,
      currentMonthlyConversations: 0,
      isExistingConversation: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Account is inactive.");
  });
});
