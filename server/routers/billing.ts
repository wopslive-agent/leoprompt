import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  BILLING_PLANS,
  canProcessInboundConversation,
  getBillingPlan,
  getMonthlyConversationLimit,
  hasStripeBillingConfig,
  type PaidPlanId,
} from "../_core/billing";
import { getRequestBaseUrl, getStripeClient } from "../_core/stripe";
import type { TrpcContext } from "../_core/context";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAccountByUserId,
  getMonthlyConversationCountByAccount,
  updateAccount,
} from "../db";
import type { Account } from "../../drizzle/schema";

const planInput = z.object({
  plan: z.enum(["starter", "pro", "agency"]),
});

function publicPlan(planId: PaidPlanId) {
  const plan = getBillingPlan(planId);
  return {
    id: plan.id,
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    monthlyConversationLimit: plan.monthlyConversationLimit,
    description: plan.description,
    features: plan.features,
    configured: Boolean(plan.stripePriceId),
  };
}

type AuthContext = TrpcContext & {
  user: NonNullable<TrpcContext["user"]>;
};

type CheckoutResult = {
  demoMode: boolean;
  url: string | null;
  message: string | null;
};

async function createCheckoutSessionForAccount(
  ctx: AuthContext,
  account: Account,
  planId: PaidPlanId
): Promise<CheckoutResult> {
  const plan = getBillingPlan(planId);
  const stripe = getStripeClient();

  if (!stripe || !plan.stripePriceId) {
    await updateAccount(account.id, {
      plan: plan.id,
      active: true,
    });
    return {
      demoMode: true,
      url: null,
      message: `Demo mode: ${plan.name} is active locally.`,
    };
  }

  const baseUrl = getRequestBaseUrl(ctx.req);
  const metadata = {
    accountId: String(account.id),
    userId: String(ctx.user.id),
    plan: plan.id,
  };
  const customerId =
    account.stripeCustomerId ??
    (
      await stripe.customers.create({
        email: ctx.user.email ?? undefined,
        name: account.businessName,
        metadata,
      })
    ).id;

  if (!account.stripeCustomerId) {
    await updateAccount(account.id, { stripeCustomerId: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${baseUrl}/billing?checkout=success`,
    cancel_url: `${baseUrl}/billing?checkout=cancelled`,
    metadata,
    subscription_data: { metadata },
  });

  return {
    demoMode: false,
    url: session.url,
    message: null,
  };
}

export const billingRouter = router({
  plans: protectedProcedure.query(() => BILLING_PLANS.map(plan => publicPlan(plan.id))),

  current: protectedProcedure.query(async ({ ctx }) => {
    const account = await getAccountByUserId(ctx.user.id);
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

    const monthlyConversations = await getMonthlyConversationCountByAccount(account.id);
    const monthlyLimit = getMonthlyConversationLimit(account.plan);
    const usageGate = canProcessInboundConversation({
      account,
      currentMonthlyConversations: monthlyConversations,
      isExistingConversation: false,
    });

    return {
      account,
      usage: {
        monthlyConversations,
        monthlyLimit,
        percent:
          monthlyLimit > 0
            ? Math.min(100, Math.round((monthlyConversations / monthlyLimit) * 100))
            : 0,
        canStartNewConversation: usageGate.allowed,
        reason: usageGate.reason,
      },
      stripeConfigured: hasStripeBillingConfig(),
    };
  }),

  createCheckoutSession: protectedProcedure
    .input(planInput)
    .mutation(async ({ ctx, input }) => {
      const account = await getAccountByUserId(ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

      return createCheckoutSessionForAccount(ctx, account, input.plan);
    }),

  changePlan: protectedProcedure.input(planInput).mutation(async ({ ctx, input }) => {
    const account = await getAccountByUserId(ctx.user.id);
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

    const plan = getBillingPlan(input.plan);
    const stripe = getStripeClient();

    if (!stripe || !plan.stripePriceId) {
      await updateAccount(account.id, {
        plan: plan.id,
        active: true,
      });
      return {
        demoMode: true,
        url: null,
        message: `Demo mode: changed to ${plan.name}.`,
      };
    }

    if (!account.stripeSubscriptionId) {
      return createCheckoutSessionForAccount(ctx, account, input.plan);
    }

    const subscription = await stripe.subscriptions.retrieve(
      account.stripeSubscriptionId
    );
    const subscriptionItemId = subscription.items.data[0]?.id;
    if (!subscriptionItemId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Subscription has no billable item to update.",
      });
    }

    await stripe.subscriptions.update(account.stripeSubscriptionId, {
      items: [{ id: subscriptionItemId, price: plan.stripePriceId }],
      proration_behavior: "create_prorations",
    });

    await updateAccount(account.id, {
      plan: plan.id,
      active: true,
    });

    return {
      demoMode: false,
      url: null,
      message: `Changed to ${plan.name}.`,
    };
  }),

  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    const account = await getAccountByUserId(ctx.user.id);
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

    const stripe = getStripeClient();
    if (!stripe || !account.stripeCustomerId) {
      return {
        demoMode: true,
        url: null,
        message: "Demo mode: Stripe customer portal is not configured locally.",
      };
    }

    const baseUrl = getRequestBaseUrl(ctx.req);
    const session = await stripe.billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: `${baseUrl}/billing`,
    });

    return {
      demoMode: false,
      url: session.url,
      message: null,
    };
  }),
});
