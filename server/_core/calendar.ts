import crypto from "node:crypto";
import axios from "axios";
import type { Account } from "../../drizzle/schema";
import { updateAccount } from "../db";
import type { ExtractedFields } from "./ai";
import { ENV } from "./env";

const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
];
const GOOGLE_CALENDAR_TOKEN_PREFIX = "gcal:v1";
const GOOGLE_CALENDAR_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export const GOOGLE_CALENDAR_OAUTH_STATE_COOKIE = "google_calendar_oauth_state";

type GoogleCalendarOAuthStatePayload = {
  v: 1;
  userId: number;
  accountId: number;
  calendarId: string;
  redirectUri: string;
  nonce: string;
  expiresAt: number;
};

type GoogleCalendarTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

/**
 * Build a booking link to append to the SMS reply when a lead qualifies.
 * Returns the Calendly URL if configured, otherwise falls back to null.
 */
export function getBookingLink(account: Account): string | null {
  if (account.calendlyUrl && account.calendlyUrl.trim()) {
    return account.calendlyUrl.trim();
  }
  return null;
}

/**
 * Append the Calendly booking link to a reply text if one is configured.
 * Keeps the combined message under 600 characters.
 */
export function appendBookingLink(replyText: string, account: Account): string {
  const link = getBookingLink(account);
  if (!link) return replyText;

  const suffix = `\n\nBook here: ${link}`;
  // Trim reply if necessary to keep total under 600 chars
  const maxReplyLen = 600 - suffix.length;
  const trimmed =
    replyText.length > maxReplyLen
      ? replyText.slice(0, maxReplyLen - 3) + "..."
      : replyText;
  return trimmed + suffix;
}

export function getGoogleCalendarOAuthRedirectUri(origin?: string): string {
  if (ENV.googleCalendarRedirectUri) return ENV.googleCalendarRedirectUri;

  const baseUrl = ENV.appBaseUrl || origin;
  if (!baseUrl) {
    throw new Error(
      "APP_BASE_URL or GOOGLE_CALENDAR_REDIRECT_URI is required for Google Calendar OAuth"
    );
  }

  return `${baseUrl.replace(/\/$/, "")}/settings?googleCalendar=callback`;
}

export function ensureGoogleCalendarOAuthConfigured(): void {
  if (!ENV.googleClientId || !ENV.googleClientSecret) {
    throw new Error(
      "Google Calendar OAuth client credentials are not configured"
    );
  }
}

export function buildGoogleCalendarAuthUrl(input: {
  state: string;
  redirectUri: string;
}): string {
  ensureGoogleCalendarOAuthConfigured();

  const params = new URLSearchParams({
    client_id: ENV.googleClientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function createGoogleCalendarOAuthState(input: {
  userId: number;
  accountId: number;
  calendarId: string;
  redirectUri: string;
  now?: number;
}): string {
  const now = input.now ?? Date.now();
  const payload: GoogleCalendarOAuthStatePayload = {
    v: 1,
    userId: input.userId,
    accountId: input.accountId,
    calendarId: input.calendarId,
    redirectUri: input.redirectUri,
    nonce: crypto.randomBytes(18).toString("base64url"),
    expiresAt: now + GOOGLE_CALENDAR_STATE_MAX_AGE_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  const signature = signGoogleCalendarValue(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function validateGoogleCalendarOAuthState(
  state: string,
  now = Date.now()
): GoogleCalendarOAuthStatePayload {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid Google Calendar OAuth state");
  }

  const expectedSignature = signGoogleCalendarValue(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) {
    throw new Error("Invalid Google Calendar OAuth state signature");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8")
  ) as Partial<GoogleCalendarOAuthStatePayload>;

  if (
    payload.v !== 1 ||
    typeof payload.userId !== "number" ||
    typeof payload.accountId !== "number" ||
    typeof payload.calendarId !== "string" ||
    typeof payload.redirectUri !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.expiresAt !== "number"
  ) {
    throw new Error("Invalid Google Calendar OAuth state payload");
  }

  if (payload.expiresAt < now) {
    throw new Error("Expired Google Calendar OAuth state");
  }

  return payload as GoogleCalendarOAuthStatePayload;
}

export function createGoogleCalendarOAuthStateCookieValue(
  state: string
): string {
  return signGoogleCalendarValue(`cookie:${state}`);
}

export function validateGoogleCalendarOAuthStateCookie(
  state: string,
  cookieValue: string | undefined | null
): boolean {
  if (!cookieValue) return false;
  return safeEqual(
    cookieValue,
    createGoogleCalendarOAuthStateCookieValue(state)
  );
}

export async function exchangeGoogleCalendarOAuthCode(input: {
  code: string;
  redirectUri: string;
}): Promise<GoogleCalendarTokenResponse> {
  ensureGoogleCalendarOAuthConfigured();

  const resp = await axios.post<GoogleCalendarTokenResponse>(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 8_000,
    }
  );

  if (!resp.data.access_token) {
    throw new Error(
      "Google OAuth token response did not include an access token"
    );
  }

  return resp.data;
}

export function isEncryptedGoogleCalendarToken(value: string): boolean {
  return value.startsWith(`${GOOGLE_CALENDAR_TOKEN_PREFIX}:`);
}

export function encryptGoogleCalendarToken(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    getGoogleCalendarEncryptionKey(),
    iv
  );
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    GOOGLE_CALENDAR_TOKEN_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptGoogleCalendarToken(value: string): string {
  if (!isEncryptedGoogleCalendarToken(value)) return value;

  const [, version, iv, tag, ciphertext] = value.split(":");
  if (
    `gcal:${version}` !== GOOGLE_CALENDAR_TOKEN_PREFIX ||
    !iv ||
    !tag ||
    !ciphertext
  ) {
    throw new Error("Invalid encrypted Google Calendar token format");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getGoogleCalendarEncryptionKey(),
    Buffer.from(iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function getGoogleCalendarStatus(account: Account): {
  connected: boolean;
  calendarId: string | null;
} {
  const calendarId = account.googleCalendarId?.trim() || null;
  let connected = Boolean(
    calendarId &&
    account.googleCalendarAccessToken &&
    account.googleCalendarRefreshToken
  );

  if (connected) {
    try {
      getGoogleCalendarCredentials(account);
    } catch {
      connected = false;
    }
  }

  return {
    connected,
    calendarId,
  };
}

export function getGoogleCalendarCredentials(account: Account): {
  calendarId: string;
  accessToken: string;
  refreshToken: string;
} | null {
  if (
    !account.googleCalendarId ||
    !account.googleCalendarAccessToken ||
    !account.googleCalendarRefreshToken
  ) {
    return null;
  }

  return {
    calendarId: account.googleCalendarId,
    accessToken: decryptGoogleCalendarToken(account.googleCalendarAccessToken),
    refreshToken: decryptGoogleCalendarToken(
      account.googleCalendarRefreshToken
    ),
  };
}

/**
 * Refresh an expired Google Calendar access token using the stored refresh token.
 * Returns the new access token, or null on failure.
 */
export async function refreshGoogleToken(
  refreshToken: string
): Promise<string | null> {
  if (!ENV.googleClientId || !ENV.googleClientSecret) return null;
  try {
    const resp = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        client_id: ENV.googleClientId,
        client_secret: ENV.googleClientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 8_000,
      }
    );
    return (resp.data as { access_token: string }).access_token ?? null;
  } catch (err) {
    console.error("[Calendar] Token refresh failed:", err);
    return null;
  }
}

/**
 * Create a Google Calendar event for a qualified lead.
 * Silently skips if the account has no Google Calendar credentials.
 */
export async function createCalendarEvent(
  account: Account,
  fields: ExtractedFields
): Promise<void> {
  let credentials: ReturnType<typeof getGoogleCalendarCredentials>;
  try {
    credentials = getGoogleCalendarCredentials(account);
  } catch (err) {
    console.error("[Calendar] Failed to decrypt stored credentials:", err);
    return;
  }
  if (!credentials) return; // Google Calendar not configured for this account

  const {
    eventDate,
    preferredTime,
    fullAddress,
    bookingType,
    firstName,
    guestCount,
    duration,
  } = fields;

  if (!eventDate) return; // Can't create an event without a date

  // Build start/end times
  const timeStr = preferredTime ?? "18:00";
  const startIso = `${eventDate}T${timeStr.includes(":") ? timeStr : timeStr + ":00"}:00`;
  const startMs = new Date(startIso).getTime();
  const durationHours = duration ? parseDurationHours(duration) : 2;
  const endMs = startMs + durationHours * 3600 * 1000;
  const endIso = new Date(endMs).toISOString();

  const summary = [
    bookingType?.replace(/_/g, " ") ?? "Booking",
    firstName ? `— ${firstName}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const description = [
    guestCount ? `Guests: ${guestCount}` : null,
    fullAddress ? `Address: ${fullAddress}` : null,
    duration ? `Duration: ${duration}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const event = {
    summary,
    description,
    location: fullAddress ?? undefined,
    start: {
      dateTime: new Date(startMs).toISOString(),
      timeZone: "America/Toronto",
    },
    end: { dateTime: endIso, timeZone: "America/Toronto" },
  };

  await ensureStoredGoogleCalendarCredentialsEncrypted(account, credentials);

  const calendarId = encodeURIComponent(credentials.calendarId);
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

  let token = credentials.accessToken;
  try {
    await axios.post(endpoint, event, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10_000,
    });
    console.info(`[Calendar] Event created: "${summary}" on ${eventDate}`);
  } catch (err: any) {
    if (err?.response?.status === 401 && credentials.refreshToken) {
      // Token expired — refresh and retry once
      const newToken = await refreshGoogleToken(credentials.refreshToken);
      if (newToken) {
        token = newToken;
        await updateAccount(account.id, {
          googleCalendarAccessToken: encryptGoogleCalendarToken(newToken),
        });
        try {
          await axios.post(endpoint, event, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            timeout: 10_000,
          });
          console.info(
            `[Calendar] Event created after token refresh: "${summary}"`
          );
        } catch (retryErr) {
          console.error(
            "[Calendar] Event creation failed after token refresh:",
            retryErr
          );
        }
      }
    } else {
      console.error(
        "[Calendar] Event creation failed:",
        err?.response?.data ?? err
      );
    }
  }
}

async function ensureStoredGoogleCalendarCredentialsEncrypted(
  account: Account,
  credentials: NonNullable<ReturnType<typeof getGoogleCalendarCredentials>>
) {
  const update: Partial<Account> = {};

  if (
    account.googleCalendarAccessToken &&
    !isEncryptedGoogleCalendarToken(account.googleCalendarAccessToken)
  ) {
    update.googleCalendarAccessToken = encryptGoogleCalendarToken(
      credentials.accessToken
    );
  }
  if (
    account.googleCalendarRefreshToken &&
    !isEncryptedGoogleCalendarToken(account.googleCalendarRefreshToken)
  ) {
    update.googleCalendarRefreshToken = encryptGoogleCalendarToken(
      credentials.refreshToken
    );
  }

  if (Object.keys(update).length > 0) {
    await updateAccount(account.id, update);
  }
}

function signGoogleCalendarValue(value: string): string {
  return crypto
    .createHmac("sha256", getGoogleCalendarStateSecret())
    .update(value)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getGoogleCalendarStateSecret(): string {
  const secret = ENV.googleOAuthStateSecret || ENV.cookieSecret;
  if (!secret) throw new Error("Google OAuth state secret is not configured");
  return secret;
}

function getGoogleCalendarEncryptionKey(): Buffer {
  const secret =
    ENV.googleCalendarTokenEncryptionKey ||
    (!ENV.isProduction ? ENV.cookieSecret : "");

  if (!secret) {
    throw new Error(
      "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY is required for Google Calendar credentials"
    );
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function parseDurationHours(duration: string): number {
  const lower = duration.toLowerCase();
  const match = lower.match(/(\d+(?:\.\d+)?)\s*(h|hour|hr)/);
  if (match) return parseFloat(match[1]);
  const minMatch = lower.match(/(\d+)\s*(m|min)/);
  if (minMatch) return parseInt(minMatch[1]) / 60;
  return 2; // default 2 hours
}
