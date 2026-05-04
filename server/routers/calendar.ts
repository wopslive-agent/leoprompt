import { TRPCError } from "@trpc/server";
import { parse as parseCookieHeader } from "cookie";
import { z } from "zod";
import type { Account } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { getSessionCookieOptions } from "../_core/cookies";
import {
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
  buildGoogleCalendarAuthUrl,
  createGoogleCalendarOAuthState,
  createGoogleCalendarOAuthStateCookieValue,
  decryptGoogleCalendarToken,
  encryptGoogleCalendarToken,
  exchangeGoogleCalendarOAuthCode,
  getGoogleCalendarOAuthRedirectUri,
  getGoogleCalendarStatus,
  validateGoogleCalendarOAuthState,
  validateGoogleCalendarOAuthStateCookie,
} from "../_core/calendar";
import { protectedProcedure, router } from "../_core/trpc";
import { getAccountByUserId, updateAccount } from "../db";

const startOAuthInput = z
  .object({
    calendarId: z.string().trim().min(1).max(255).optional(),
  })
  .optional();

const completeOAuthInput = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const calendarRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const account = await getAccountByUserId(ctx.user.id);
    return toCalendarIntegrationStatus(account);
  }),

  startOAuth: protectedProcedure
    .input(startOAuthInput)
    .mutation(async ({ ctx, input }) => {
      const account = await getOwnedAccount(ctx.user.id);

      try {
        const redirectUri = getGoogleCalendarOAuthRedirectUri(
          getRequestOrigin(ctx.req)
        );
        const state = createGoogleCalendarOAuthState({
          userId: ctx.user.id,
          accountId: account.id,
          calendarId: input?.calendarId ?? "primary",
          redirectUri,
        });

        ctx.res.cookie(
          GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
          createGoogleCalendarOAuthStateCookieValue(state),
          {
            ...getSessionCookieOptions(ctx.req),
            maxAge: 10 * 60 * 1000,
          }
        );

        return {
          authUrl: buildGoogleCalendarAuthUrl({ state, redirectUri }),
        };
      } catch (error) {
        throw mapCalendarError(error);
      }
    }),

  completeOAuth: protectedProcedure
    .input(completeOAuthInput)
    .mutation(async ({ ctx, input }) => {
      const stateCookie = readCookie(
        ctx.req.headers.cookie,
        GOOGLE_CALENDAR_OAUTH_STATE_COOKIE
      );

      if (!validateGoogleCalendarOAuthStateCookie(input.state, stateCookie)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Google Calendar connection could not be verified. Please try again.",
        });
      }

      let state;
      try {
        state = validateGoogleCalendarOAuthState(input.state);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Google Calendar connection expired. Please try again.",
        });
      }

      const account = await getOwnedAccount(ctx.user.id);
      if (state.userId !== ctx.user.id || state.accountId !== account.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Google Calendar connection is not for this account.",
        });
      }

      try {
        const tokenResponse = await exchangeGoogleCalendarOAuthCode({
          code: input.code,
          redirectUri: state.redirectUri,
        });
        const refreshToken =
          tokenResponse.refresh_token ?? decryptExistingRefreshToken(account);

        if (!refreshToken) {
          throw new Error(
            "Google did not return a refresh token. Reconnect and approve offline access."
          );
        }

        await updateAccount(account.id, {
          googleCalendarId: state.calendarId,
          googleCalendarAccessToken: encryptGoogleCalendarToken(
            tokenResponse.access_token!
          ),
          googleCalendarRefreshToken: encryptGoogleCalendarToken(refreshToken),
        });

        clearStateCookie(ctx);

        return {
          googleCalendar: {
            connected: true,
            calendarId: state.calendarId,
          },
        };
      } catch (error) {
        throw mapCalendarError(error);
      }
    }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const account = await getOwnedAccount(ctx.user.id);
    await updateAccount(account.id, {
      googleCalendarId: null,
      googleCalendarAccessToken: null,
      googleCalendarRefreshToken: null,
    });
    clearStateCookie(ctx);

    return {
      googleCalendar: {
        connected: false,
        calendarId: null,
      },
    };
  }),
});

async function getOwnedAccount(userId: number): Promise<Account> {
  const account = await getAccountByUserId(userId);
  if (!account) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Account not found",
    });
  }
  return account;
}

function toCalendarIntegrationStatus(account: Account | undefined) {
  const googleCalendar = account
    ? getGoogleCalendarStatus(account)
    : { connected: false, calendarId: null };

  return {
    googleCalendar,
    calendly: {
      connected: Boolean(account?.calendlyUrl?.trim()),
      url: account?.calendlyUrl ?? null,
    },
  };
}

function decryptExistingRefreshToken(account: Account): string | null {
  if (!account.googleCalendarRefreshToken) return null;
  return decryptGoogleCalendarToken(account.googleCalendarRefreshToken);
}

function clearStateCookie(ctx: TrpcContext) {
  ctx.res.clearCookie(
    GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
    getSessionCookieOptions(ctx.req)
  );
}

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  return parseCookieHeader(cookieHeader)[name];
}

function getRequestOrigin(
  req: Pick<TrpcContext["req"], "protocol" | "headers">
) {
  const forwardedHost = firstHeaderValue(req.headers["x-forwarded-host"]);
  const host = forwardedHost ?? firstHeaderValue(req.headers.host);
  const proto =
    firstHeaderValue(req.headers["x-forwarded-proto"]) ??
    req.protocol ??
    "http";

  if (!host) {
    throw new Error("Request host is required for Google Calendar OAuth");
  }

  return `${proto}://${host}`;
}

function firstHeaderValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstHeaderValue(value[0]);
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.split(",")[0]?.trim();
}

function mapCalendarError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  const message =
    error instanceof Error
      ? error.message
      : "Google Calendar connection failed";

  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message,
  });
}
