import type { Request, Response } from "express";
import Stripe from "stripe";
import {
  getPlanByStripePriceId,
  type PlanId,
} from "../billing";
import { ENV } from "../env";
import { getStripeClient, getStripeObjectId } from "../stripe";
import {
  getAccountByStripeCustomerId,
  getAccountByStripeSubscriptionId,
  updateAccount,
} from "../../db";

async function findAccountForSubscription(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;
  const customerId = getStripeObjectId(subscription.customer);

  const bySubscription = await getAccountByStripeSubscriptionId(subscriptionId);
  if (bySubscription) return bySubscription;

  if (!customerId) return undefined;
  return getAccountByStripeCustomerId(customerId);
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const account = await findAccountForSubscription(subscription);
  if (!account) {
    console.warn(
      `[Stripe] No account found for subscription ${subscription.id}`
    );
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanByStripePriceId(priceId);
  const active = ["active", "trialing"].includes(subscription.status);

  await updateAccount(account.id, {
    stripeCustomerId: getStripeObjectId(subscription.customer) ?? null,
    stripeSubscriptionId: subscription.id,
    plan: plan?.id ?? account.plan,
    active,
  });
}

async function cancelSubscription(subscription: Stripe.Subscription) {
  const account = await findAccountForSubscription(subscription);
  if (!account) {
    console.warn(
      `[Stripe] No account found for canceled subscription ${subscription.id}`
    );
    return;
  }

  await updateAccount(account.id, {
    stripeSubscriptionId: null,
    plan: "trial" satisfies PlanId,
    active: false,
  });
}

export async function handleStripeWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const stripe = getStripeClient();
  if (!stripe || !ENV.stripeWebhookSecret) {
    res.status(503).send("Stripe webhook is not configured");
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    res.status(400).send("Missing Stripe signature");
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      ENV.stripeWebhookSecret
    );
  } catch (error) {
    console.warn("[Stripe] Invalid webhook signature:", error);
    res.status(400).send("Invalid Stripe signature");
    return;
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await cancelSubscription(event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }

  res.status(200).json({ received: true });
}
