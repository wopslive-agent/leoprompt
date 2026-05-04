import type { Account } from "../../drizzle/schema";
import { ENV } from "./env";

export type PlanId = Account["plan"];
export type PaidPlanId = Exclude<PlanId, "trial">;

export type BillingPlan = {
  id: PaidPlanId;
  name: string;
  monthlyPrice: number;
  monthlyConversationLimit: number;
  description: string;
  features: string[];
  stripePriceId?: string;
};

export const TRIAL_MONTHLY_CONVERSATION_LIMIT = 25;

export const PLAN_MONTHLY_CONVERSATION_LIMITS: Record<PlanId, number> = {
  trial: TRIAL_MONTHLY_CONVERSATION_LIMIT,
  starter: 100,
  pro: 500,
  agency: 2500,
};

export type InboundWebhookBillingBlockReason =
  | "account_inactive"
  | "monthly_conversation_limit_reached";

export type InboundWebhookBillingAllowReason =
  | "existing_conversation"
  | "within_monthly_conversation_limit";

export type InboundWebhookBillingGateReason =
  | InboundWebhookBillingAllowReason
  | InboundWebhookBillingBlockReason;

type InboundWebhookBillingGateContext = {
  plan: PlanId;
  monthlyConversationLimit: number;
  currentMonthlyConversations: number;
  isExistingConversation: boolean;
};

export type InboundWebhookBillingGateDecision =
  | (InboundWebhookBillingGateContext & {
      allowed: true;
      reason: "existing_conversation";
      blockReason: null;
      customerMessage: null;
      requiresNewConversationSlot: false;
    })
  | (InboundWebhookBillingGateContext & {
      allowed: true;
      reason: "within_monthly_conversation_limit";
      blockReason: null;
      customerMessage: null;
      requiresNewConversationSlot: true;
    })
  | (InboundWebhookBillingGateContext & {
      allowed: false;
      reason: InboundWebhookBillingBlockReason;
      blockReason: InboundWebhookBillingBlockReason;
      customerMessage: string;
      requiresNewConversationSlot: false;
    });

export const INBOUND_WEBHOOK_BILLING_BLOCK_MESSAGES: Record<
  InboundWebhookBillingBlockReason,
  string
> = {
  account_inactive:
    "This business is not currently accepting concierge messages. Please contact them directly for help.",
  monthly_conversation_limit_reached:
    "This business cannot start a new concierge conversation right now. Please contact them directly for help.",
};

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 49,
    monthlyConversationLimit: PLAN_MONTHLY_CONVERSATION_LIMITS.starter,
    description: "For solo operators testing SMS concierge workflows.",
    features: [
      "100 new SMS conversations per month",
      "AI lead qualification",
      "In-app notifications",
    ],
    stripePriceId: ENV.stripeStarterPriceId || undefined,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 99,
    monthlyConversationLimit: PLAN_MONTHLY_CONVERSATION_LIMITS.pro,
    description: "For growing businesses with steady inbound demand.",
    features: [
      "500 new SMS conversations per month",
      "Priority handoff routing",
      "Lead export and manager notes",
    ],
    stripePriceId: ENV.stripeProPriceId || undefined,
  },
  {
    id: "agency",
    name: "Agency",
    monthlyPrice: 249,
    monthlyConversationLimit: PLAN_MONTHLY_CONVERSATION_LIMITS.agency,
    description: "For teams managing high-volume concierge intake.",
    features: [
      "2,500 new SMS conversations per month",
      "Multi-campaign ready limits",
      "Highest usage ceiling",
    ],
    stripePriceId: ENV.stripeAgencyPriceId || undefined,
  },
];

const PAID_PLAN_IDS = BILLING_PLANS.map(plan => plan.id);

export function isPaidPlanId(planId: string): planId is PaidPlanId {
  return PAID_PLAN_IDS.includes(planId as PaidPlanId);
}

export function getBillingPlan(planId: PaidPlanId): BillingPlan {
  const plan = BILLING_PLANS.find(candidate => candidate.id === planId);
  if (!plan) throw new Error(`Unknown billing plan: ${planId}`);
  return plan;
}

export function getMonthlyConversationLimit(planId: PlanId): number {
  const limit = PLAN_MONTHLY_CONVERSATION_LIMITS[planId];
  if (limit === undefined) throw new Error(`Unknown billing plan: ${planId}`);
  return limit;
}

export function getPlanByStripePriceId(priceId?: string | null) {
  if (!priceId) return undefined;
  return BILLING_PLANS.find(plan => plan.stripePriceId === priceId);
}

export function hasStripeBillingConfig(): boolean {
  return Boolean(ENV.stripeSecretKey);
}

/**
 * Pure billing gate for inbound webhooks. Call after account lookup and after
 * determining whether the sender already has a conversation for this account.
 */
export function evaluateInboundWebhookBillingGate({
  account,
  currentMonthlyConversations,
  isExistingConversation,
}: {
  account: Pick<Account, "active" | "plan">;
  currentMonthlyConversations: number;
  isExistingConversation: boolean;
}): InboundWebhookBillingGateDecision {
  const monthlyConversationLimit = getMonthlyConversationLimit(account.plan);
  const decisionContext = {
    plan: account.plan,
    monthlyConversationLimit,
    currentMonthlyConversations,
    isExistingConversation,
  };

  if (!account.active) {
    return {
      ...decisionContext,
      allowed: false,
      reason: "account_inactive",
      blockReason: "account_inactive",
      customerMessage: INBOUND_WEBHOOK_BILLING_BLOCK_MESSAGES.account_inactive,
      requiresNewConversationSlot: false,
    };
  }

  if (isExistingConversation) {
    return {
      ...decisionContext,
      allowed: true,
      reason: "existing_conversation",
      blockReason: null,
      customerMessage: null,
      requiresNewConversationSlot: false,
    };
  }

  if (currentMonthlyConversations >= monthlyConversationLimit) {
    return {
      ...decisionContext,
      allowed: false,
      reason: "monthly_conversation_limit_reached",
      blockReason: "monthly_conversation_limit_reached",
      customerMessage:
        INBOUND_WEBHOOK_BILLING_BLOCK_MESSAGES.monthly_conversation_limit_reached,
      requiresNewConversationSlot: false,
    };
  }

  return {
    ...decisionContext,
    allowed: true,
    reason: "within_monthly_conversation_limit",
    blockReason: null,
    customerMessage: null,
    requiresNewConversationSlot: true,
  };
}

export function canProcessInboundConversation({
  account,
  currentMonthlyConversations,
  isExistingConversation,
}: {
  account: Pick<Account, "active" | "plan">;
  currentMonthlyConversations: number;
  isExistingConversation: boolean;
}) {
  const gate = evaluateInboundWebhookBillingGate({
    account,
    currentMonthlyConversations,
    isExistingConversation,
  });

  if (!gate.allowed && gate.blockReason === "account_inactive") {
    return {
      allowed: false,
      reason: "Account is inactive.",
      blockReason: gate.blockReason,
      customerMessage: gate.customerMessage,
    } as const;
  }

  if (gate.allowed && gate.reason === "existing_conversation") {
    return {
      allowed: true,
      reason: "Existing conversations can continue.",
      blockReason: null,
      customerMessage: null,
    } as const;
  }

  if (!gate.allowed) {
    return {
      allowed: false,
      reason: `Monthly conversation limit reached (${gate.monthlyConversationLimit}).`,
      blockReason: gate.blockReason,
      customerMessage: gate.customerMessage,
    } as const;
  }

  return {
    allowed: true,
    reason: "Within monthly conversation limit.",
    blockReason: null,
    customerMessage: null,
  } as const;
}
