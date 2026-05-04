import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAccountByUserId,
  getFollowUpJobsByAccount,
  updateFollowUpJobStatus,
} from "../db";

export const followUpRouter = router({
  /**
   * List all follow-up jobs for the current account.
   */
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }))
    .query(async ({ ctx, input }) => {
      const account = await getAccountByUserId(ctx.user.id);
      if (!account) throw new Error("Account not found");
      return getFollowUpJobsByAccount(account.id, input.limit ?? 50);
    }),

  /**
   * Cancel a specific follow-up job.
   */
  cancel: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const account = await getAccountByUserId(ctx.user.id);
      if (!account) throw new Error("Account not found");
      await updateFollowUpJobStatus(input.jobId, "cancelled");
      return { success: true };
    }),
});
