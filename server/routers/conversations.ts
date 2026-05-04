import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAccountByUserId,
  getConversationsByAccount,
  getConversationById,
  updateConversation,
  getMessagesByConversation,
  createMessage,
} from "../db";

export const conversationsRouter = router({
  /**
   * Get all conversations for the operator's account
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        status: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const account = await getAccountByUserId(ctx.user.id);
      if (!account) throw new Error("Account not found");

      const conversations = await getConversationsByAccount(account.id, input.limit);
      
      // Filter by status if provided
      if (input.status) {
        return conversations.filter((c) => c.status === input.status);
      }
      
      return conversations;
    }),

  /**
   * Get a specific conversation with all messages
   */
  getDetail: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const account = await getAccountByUserId(ctx.user.id);
      if (!account) throw new Error("Account not found");

      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.accountId !== account.id) {
        throw new Error("Unauthorized");
      }

      const messages = await getMessagesByConversation(input.conversationId);
      return { conversation, messages };
    }),

  /**
   * Update conversation status
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        status: z.enum([
          "new",
          "faq_only",
          "collecting_details",
          "qualified",
          "handoff_needed",
          "human_review",
          "awaiting_manager",
          "rejected",
          "closed",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await getAccountByUserId(ctx.user.id);
      if (!account) throw new Error("Account not found");

      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.accountId !== account.id) {
        throw new Error("Unauthorized");
      }

      await updateConversation(input.conversationId, { status: input.status });
      return { success: true };
    }),

  /**
   * Add a manual note to a conversation
   */
  addNote: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        note: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await getAccountByUserId(ctx.user.id);
      if (!account) throw new Error("Account not found");

      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.accountId !== account.id) {
        throw new Error("Unauthorized");
      }

      // Create a system message with the note
      await createMessage({
        conversationId: input.conversationId,
        role: "assistant",
        body: `[Manager Note: ${input.note}]`,
      });

      return { success: true };
    }),
});
