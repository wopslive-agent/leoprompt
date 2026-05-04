import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAccountByUserId,
  createAccount,
  updateAccount,
  deleteUserAccount,
  createAiPersonaVersion,
} from "../db";

export const accountsRouter = router({
  /**
   * Get or create account for the current user
   */
  getOrCreate: protectedProcedure.query(async ({ ctx }) => {
    const existing = await getAccountByUserId(ctx.user.id);
    if (existing) return existing;

    // Create a new account with default values
    const newAccount = await createAccount({
      userId: ctx.user.id,
      businessName: "My Business",
    });
    return newAccount;
  }),

  /**
   * Update account details (business name, services, pricing, availability, AI persona)
   */
  update: protectedProcedure
    .input(
      z.object({
        businessName: z.string().optional(),
        servicesOffered: z.string().optional(),
        pricing: z.string().optional(),
        availability: z.string().optional(),
        aiPersona: z.string().optional(),
        notificationEmail: z.string().email().optional(),
        twilioPhoneNumber: z.string().optional(),
        calendlyUrl: z.string().url().optional().or(z.literal("")),
        whatsappPhoneNumber: z.string().optional(),
        followUpEnabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await getAccountByUserId(ctx.user.id);
      if (!account) throw new Error("Account not found");

      await updateAccount(account.id, input);
      if (
        input.aiPersona !== undefined &&
        input.aiPersona.trim() &&
        input.aiPersona !== account.aiPersona
      ) {
        await createAiPersonaVersion({
          accountId: account.id,
          userId: ctx.user.id,
          aiPersona: input.aiPersona,
          label: "Settings update",
        });
      }
      const updated = await getAccountByUserId(ctx.user.id);
      return updated || account;
    }),

  /**
   * Complete onboarding wizard
   */
  completeOnboarding: protectedProcedure
    .input(
      z.object({
        businessName: z.string().min(1),
        servicesOffered: z.string(),
        pricing: z.string(),
        availability: z.string(),
        aiPersona: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await getAccountByUserId(ctx.user.id);
      if (!account) throw new Error("Account not found");

      await updateAccount(account.id, {
        businessName: input.businessName,
        servicesOffered: input.servicesOffered,
        pricing: input.pricing,
        availability: input.availability,
        aiPersona: input.aiPersona,
      });
      await createAiPersonaVersion({
        accountId: account.id,
        userId: ctx.user.id,
        aiPersona: input.aiPersona,
        label: "Onboarding",
      });

      const updated = await getAccountByUserId(ctx.user.id);
      return updated || account;
    }),

  /**
   * Get account by ID (for dashboard access)
   */
  getById: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ ctx, input }) => {
      const account = await getAccountByUserId(ctx.user.id);
      if (!account || account.id !== input.accountId) {
        throw new Error("Unauthorized");
      }
      return account;
    }),

  /**
   * Permanently delete the current user and all owned account data.
   */
  deleteCurrent: protectedProcedure.mutation(async ({ ctx }) => {
    await deleteUserAccount(ctx.user.id);

    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });

    return { success: true };
  }),
});
