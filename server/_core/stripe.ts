import type { Request } from "express";
import Stripe from "stripe";
import { ENV } from "./env";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (!ENV.stripeSecretKey) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(ENV.stripeSecretKey);
  }
  return stripeClient;
}

export function getRequestBaseUrl(req: Request): string {
  if (ENV.appBaseUrl) return ENV.appBaseUrl.replace(/\/$/, "");

  const origin = req.headers.origin;
  if (typeof origin === "string" && origin) return origin.replace(/\/$/, "");

  const protocol = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.get("host");
  return `${protocol}://${host}`;
}

export function getStripeObjectId(
  value:
    | string
    | Stripe.Customer
    | Stripe.DeletedCustomer
    | Stripe.Subscription
    | null
    | undefined
) {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.id;
}
