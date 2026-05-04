import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { runIntake, STATIC_FALLBACK_REPLY } from "../_core/ai";
import { ENV } from "../_core/env";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAiPersonaVersion,
  getAccountByUserId,
  getAiPersonaVersionById,
  getAiPersonaVersionsByAccount,
  getConversationById,
  getConversationFeedbackByConversation,
  getConversationTagsByConversation,
  getMessagesByConversation,
  getTrainingAnalytics,
  setConversationTags,
  updateAccount,
  upsertConversationFeedback,
} from "../db";

const feedbackRatingSchema = z.enum([
  "works_well",
  "needs_improvement",
  "bug",
]);

const sandboxInputSchema = z.object({
  aiPersona: z.string().min(1),
  sampleMessage: z.string().min(1),
  conversationId: z.number().optional(),
});

async function getOwnedAccount(userId: number) {
  const account = await getAccountByUserId(userId);
  if (!account) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
  }
  return account;
}

async function getOwnedConversation(userId: number, conversationId: number) {
  const account = await getOwnedAccount(userId);
  const conversation = await getConversationById(conversationId);
  if (!conversation || conversation.accountId !== account.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Conversation not found" });
  }
  return { account, conversation };
}

async function getReplayHistory(userId: number, conversationId?: number) {
  if (!conversationId) {
    return [] as Array<{ role: "user" | "assistant"; content: string }>;
  }

  await getOwnedConversation(userId, conversationId);
  const messages = await getMessagesByConversation(conversationId);
  return messages.slice(-10).map(message => ({
    role: message.role as "user" | "assistant",
    content: message.body,
  }));
}

export const aiTrainingRouter = router({
  personaVersions: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const account = await getOwnedAccount(ctx.user.id);
      return getAiPersonaVersionsByAccount(account.id, input.limit);
    }),

  restorePersonaVersion: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const account = await getOwnedAccount(ctx.user.id);
      const version = await getAiPersonaVersionById(input.versionId);
      if (!version || version.accountId !== account.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Version not found" });
      }

      await updateAccount(account.id, { aiPersona: version.aiPersona });
      await createAiPersonaVersion({
        accountId: account.id,
        userId: ctx.user.id,
        aiPersona: version.aiPersona,
        label: `Rollback to version ${version.id}`,
      });

      return { success: true, aiPersona: version.aiPersona };
    }),

  getConversationReview: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      await getOwnedConversation(ctx.user.id, input.conversationId);
      const [feedback, tags] = await Promise.all([
        getConversationFeedbackByConversation(input.conversationId),
        getConversationTagsByConversation(input.conversationId),
      ]);
      return {
        feedback,
        tags: tags.map(tag => tag.tag),
      };
    }),

  saveFeedback: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        rating: feedbackRatingSchema,
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { account } = await getOwnedConversation(
        ctx.user.id,
        input.conversationId
      );
      return upsertConversationFeedback({
        accountId: account.id,
        conversationId: input.conversationId,
        rating: input.rating,
        comment: input.comment,
      });
    }),

  setTags: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        tags: z.array(z.string()).max(12),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { account } = await getOwnedConversation(
        ctx.user.id,
        input.conversationId
      );
      return setConversationTags({
        accountId: account.id,
        conversationId: input.conversationId,
        tags: input.tags,
      });
    }),

  analytics: protectedProcedure.query(async ({ ctx }) => {
    const account = await getOwnedAccount(ctx.user.id);
    return getTrainingAnalytics(account.id);
  }),

  promptSandbox: protectedProcedure
    .input(sandboxInputSchema)
    .mutation(async ({ ctx, input }) => {
      const account = await getOwnedAccount(ctx.user.id);
      const history = await getReplayHistory(ctx.user.id, input.conversationId);

      if (!ENV.anthropicApiKey) {
        return {
          demoMode: true,
          result: {
            intent: "unclear",
            reply: STATIC_FALLBACK_REPLY,
            nextAction: "continue",
            extractedFields: {},
            missingFields: [],
            confidence: 0,
            riskFlags: ["anthropic_key_missing"],
          },
        };
      }

      const result = await runIntake(
        { ...account, aiPersona: input.aiPersona },
        history,
        input.sampleMessage
      );
      return { demoMode: false, result };
    }),

  comparePrompts: protectedProcedure
    .input(
      z.object({
        variantA: z.string().min(1),
        variantB: z.string().min(1),
        sampleMessage: z.string().min(1),
        conversationId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await getOwnedAccount(ctx.user.id);
      const history = await getReplayHistory(ctx.user.id, input.conversationId);

      if (!ENV.anthropicApiKey) {
        const fallback = {
          intent: "unclear" as const,
          reply: STATIC_FALLBACK_REPLY,
          nextAction: "continue" as const,
          extractedFields: {},
          missingFields: [] as string[],
          confidence: 0,
          riskFlags: ["anthropic_key_missing"],
        };
        return {
          demoMode: true,
          variantA: fallback,
          variantB: fallback,
        };
      }

      const [variantA, variantB] = await Promise.all([
        runIntake(
          { ...account, aiPersona: input.variantA },
          history,
          input.sampleMessage
        ),
        runIntake(
          { ...account, aiPersona: input.variantB },
          history,
          input.sampleMessage
        ),
      ]);

      return {
        demoMode: false,
        variantA,
        variantB,
      };
    }),

  exportConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { conversation } = await getOwnedConversation(
        ctx.user.id,
        input.conversationId
      );
      const messages = await getMessagesByConversation(input.conversationId);
      return {
        conversation,
        messages,
        text: messages
          .map(message => {
            const at = message.createdAt.toISOString();
            return `[${at}] ${message.role.toUpperCase()}: ${message.body}`;
          })
          .join("\n"),
      };
    }),
});
