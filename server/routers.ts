import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { accountsRouter } from "./routers/accounts";
import { conversationsRouter } from "./routers/conversations";
import { notificationsRouter } from "./routers/notifications";
import { leadsRouter } from "./routers/leads";
import { billingRouter } from "./routers/billing";
import { aiTrainingRouter } from "./routers/aiTraining";
import { followUpRouter } from "./routers/followUp";
import { calendarRouter } from "./routers/calendar";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  accounts: accountsRouter,
  conversations: conversationsRouter,
  notifications: notificationsRouter,
  leads: leadsRouter,
  billing: billingRouter,
  aiTraining: aiTrainingRouter,
  followUp: followUpRouter,
  calendar: calendarRouter,
});

export type AppRouter = typeof appRouter;
