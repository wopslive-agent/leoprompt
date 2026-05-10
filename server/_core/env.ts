const DEFAULT_COOKIE_SECRET = "change-this-secret-in-production";

export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? DEFAULT_COOKIE_SECRET,
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripeStarterPriceId: process.env.STRIPE_STARTER_PRICE_ID ?? "",
  stripeProPriceId: process.env.STRIPE_PRO_PRICE_ID ?? "",
  stripeAgencyPriceId: process.env.STRIPE_AGENCY_PRICE_ID ?? "",
  appBaseUrl: process.env.APP_BASE_URL ?? "",
  smsBatchWindowMs: Number(process.env.SMS_BATCH_WINDOW_MS ?? 5000),
  // Full public URL of this server, used to reconstruct the webhook URL for Twilio
  // signature validation. Must match the URL configured in the Twilio console exactly.
  // Example: https://yourapp.com  (no trailing slash)
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL ?? "",
  // Google Calendar OAuth2 credentials for event creation
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleCalendarRedirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? "",
  googleCalendarTokenEncryptionKey:
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY ?? "",
  googleOAuthStateSecret: process.env.GOOGLE_OAUTH_STATE_SECRET ?? "",
  // AI provider: "anthropic" (default) or "ollama" (local)
  aiProvider: (process.env.AI_PROVIDER ?? "anthropic") as
    | "anthropic"
    | "ollama",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.1:8b",
  textlinksmsApiKey: process.env.TEXTLINKSMS_API_KEY ?? "",
  textlinksmsApiBase:
    process.env.TEXTLINKSMS_API_BASE ?? "https://textlinksms.com",
  textlinksmsWebhookSecret: process.env.TEXTLINKSMS_WEBHOOK_SECRET ?? "",
  textlinksmsSimCardId: process.env.TEXTLINKSMS_SIM_CARD_ID
    ? Number(process.env.TEXTLINKSMS_SIM_CARD_ID)
    : undefined,
};

export function validateRuntimeEnv() {
  const errors: string[] = [];

  if (!Number.isFinite(ENV.smsBatchWindowMs) || ENV.smsBatchWindowMs <= 0) {
    errors.push("SMS_BATCH_WINDOW_MS must be a positive number.");
  }

  if (ENV.isProduction) {
    if (!ENV.databaseUrl) {
      errors.push("DATABASE_URL is required in production.");
    }

    if (
      !process.env.JWT_SECRET ||
      ENV.cookieSecret === DEFAULT_COOKIE_SECRET ||
      ENV.cookieSecret.length < 32
    ) {
      errors.push("JWT_SECRET must be set to a strong value in production.");
    }

    if (!ENV.appBaseUrl) {
      errors.push("APP_BASE_URL is required in production.");
    }

    if (!ENV.webhookBaseUrl) {
      errors.push("WEBHOOK_BASE_URL is required in production.");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid runtime environment:\n- ${errors.join("\n- ")}`);
  }
}
