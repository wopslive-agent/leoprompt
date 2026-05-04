import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import type { TrpcContext } from "../_core/context";
import { decryptGoogleCalendarToken } from "../_core/calendar";
import { calendarRouter } from "./calendar";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const mockDb = vi.hoisted(() => ({
  account: undefined as Account | undefined,
  updateAccount: vi.fn(),
}));

const axiosMock = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    post: axiosMock.post,
  },
}));

vi.mock("../db", () => ({
  getAccountByUserId: vi.fn(async (userId: number) =>
    mockDb.account?.userId === userId ? mockDb.account : undefined
  ),
  updateAccount: mockDb.updateAccount,
}));

function createMockAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 7,
    userId: 3,
    businessName: "Calendar Test Co",
    servicesOffered: null,
    pricing: null,
    availability: null,
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
    ...overrides,
  };
}

function createAuthContext(cookieHeader?: string): {
  ctx: TrpcContext;
  setCookies: Array<{ name: string; value: string }>;
  clearedCookies: string[];
} {
  const setCookies: Array<{ name: string; value: string }> = [];
  const clearedCookies: string[] = [];
  const user: AuthenticatedUser = {
    id: 3,
    openId: "calendar-user",
    email: "calendar@example.com",
    name: "Calendar User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    ctx: {
      user,
      req: {
        protocol: "https",
        headers: {
          host: "app.example.com",
          cookie: cookieHeader,
        },
      } as TrpcContext["req"],
      res: {
        cookie: (name: string, value: string) => {
          setCookies.push({ name, value });
        },
        clearCookie: (name: string) => {
          clearedCookies.push(name);
        },
      } as TrpcContext["res"],
    },
    setCookies,
    clearedCookies,
  };
}

describe("calendar router", () => {
  beforeEach(() => {
    ENV.googleClientId = "google-client-id";
    ENV.googleClientSecret = "google-client-secret";
    ENV.googleCalendarRedirectUri =
      "https://app.example.com/settings?googleCalendar=callback";
    ENV.googleCalendarTokenEncryptionKey =
      "calendar-token-encryption-key-with-enough-entropy";
    ENV.googleOAuthStateSecret = "calendar-state-secret";
    mockDb.account = createMockAccount();
    mockDb.updateAccount.mockReset();
    axiosMock.post.mockReset();
  });

  it("starts OAuth with a signed state and state cookie", async () => {
    const { ctx, setCookies } = createAuthContext();
    const caller = calendarRouter.createCaller(ctx);

    const result = await caller.startOAuth({
      calendarId: "primary",
    });
    const authUrl = new URL(result.authUrl);

    expect(authUrl.hostname).toBe("accounts.google.com");
    expect(authUrl.searchParams.get("client_id")).toBe("google-client-id");
    expect(authUrl.searchParams.get("access_type")).toBe("offline");
    expect(authUrl.searchParams.get("prompt")).toBe("consent");
    expect(authUrl.searchParams.get("state")).toBeTruthy();
    expect(setCookies).toEqual([
      expect.objectContaining({
        name: "google_calendar_oauth_state",
      }),
    ]);
  });

  it("exchanges the callback code and stores encrypted tokens", async () => {
    const { ctx: startCtx, setCookies } = createAuthContext();
    const caller = calendarRouter.createCaller(startCtx);
    const { authUrl } = await caller.startOAuth();
    const state = new URL(authUrl).searchParams.get("state")!;
    const stateCookie = setCookies[0]!;

    axiosMock.post.mockResolvedValue({
      data: {
        access_token: "google-access-token",
        refresh_token: "google-refresh-token",
      },
    });

    const { ctx: callbackCtx, clearedCookies } = createAuthContext(
      `${stateCookie.name}=${stateCookie.value}`
    );
    const callbackCaller = calendarRouter.createCaller(callbackCtx);

    await callbackCaller.completeOAuth({
      code: "oauth-code",
      state,
    });

    expect(mockDb.updateAccount).toHaveBeenCalledWith(
      mockDb.account!.id,
      expect.objectContaining({
        googleCalendarId: "primary",
        googleCalendarAccessToken: expect.not.stringContaining(
          "google-access-token"
        ),
        googleCalendarRefreshToken: expect.not.stringContaining(
          "google-refresh-token"
        ),
      })
    );
    const stored = mockDb.updateAccount.mock.calls[0]?.[1] as Partial<Account>;
    expect(decryptGoogleCalendarToken(stored.googleCalendarAccessToken!)).toBe(
      "google-access-token"
    );
    expect(decryptGoogleCalendarToken(stored.googleCalendarRefreshToken!)).toBe(
      "google-refresh-token"
    );
    expect(clearedCookies).toContain("google_calendar_oauth_state");
  });

  it("rejects callbacks without the matching state cookie", async () => {
    const { ctx } = createAuthContext();
    const state = new URL(
      (await calendarRouter.createCaller(ctx).startOAuth()).authUrl
    ).searchParams.get("state")!;
    const callbackCaller = calendarRouter.createCaller(createAuthContext().ctx);

    await expect(
      callbackCaller.completeOAuth({
        code: "oauth-code",
        state,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(axiosMock.post).not.toHaveBeenCalled();
  });
});
