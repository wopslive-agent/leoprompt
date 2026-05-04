import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAccountByUserId,
  getNotificationsByUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationCount,
  createNotification,
} from "../db";

export const notificationsRouter = router({
  /**
   * Get all notifications for the current user
   */
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const notifications = await getNotificationsByUser(
        ctx.user.id,
        input.limit
      );
      return notifications;
    }),

  /**
   * Get unread notification count
   */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await getUnreadNotificationCount(ctx.user.id);
    return { count };
  }),

  /**
   * Mark a notification as read
   */
  markAsRead: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await markNotificationAsRead(input.notificationId, ctx.user.id);
      return { success: true };
    }),

  /**
   * Mark all notifications as read
   */
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await markAllNotificationsAsRead(ctx.user.id);
    return { success: true };
  }),

  /**
   * Create a notification (internal use)
   */
  create: protectedProcedure
    .input(
      z.object({
        type: z.enum(["new_lead", "booking_confirmed", "system"]),
        title: z.string(),
        content: z.string(),
        leadId: z.number().optional(),
        conversationId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await getAccountByUserId(ctx.user.id);
      if (!account) throw new Error("Account not found");

      const notification = await createNotification({
        accountId: account.id,
        userId: ctx.user.id,
        type: input.type,
        title: input.title,
        content: input.content,
        leadId: input.leadId,
        conversationId: input.conversationId,
      });

      return notification;
    }),
});
