import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getAccountByUserId, getLeadsByAccount } from "../db";

export const leadsRouter = router({
  /**
   * Get all qualified leads for the operator's account
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(100),
        status: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const account = await getAccountByUserId(ctx.user.id);
      if (!account) throw new Error("Account not found");

      const leads = await getLeadsByAccount(account.id, input.limit);
      
      // Filter by status if provided
      if (input.status) {
        return leads.filter((l) => l.status === input.status);
      }
      
      return leads;
    }),

  /**
   * Export leads to CSV format
   */
  exportCsv: protectedProcedure.query(async ({ ctx }) => {
    const account = await getAccountByUserId(ctx.user.id);
    if (!account) throw new Error("Account not found");

    const leads = await getLeadsByAccount(account.id, 10000);

    // Build CSV header
    const headers = [
      "Date",
      "Phone",
      "Status",
      "Service",
      "Duration",
      "Guests",
      "Address",
      "Handoff Reason",
      "Rejection Reason",
    ];

    // Build CSV rows
    const rows = leads.map((lead) => {
      const extracted = lead.extractedFields as any || {};
      return [
        lead.timestamp?.toISOString() || "",
        "", // Phone would come from conversation
        lead.status,
        extracted.bookingType || "",
        extracted.duration || "",
        extracted.guestCount || "",
        extracted.fullAddress ? extracted.fullAddress.substring(0, 50) : "",
        lead.handoffReason || "",
        lead.rejectionReason || "",
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return { csv: csvContent, filename: `leads-${Date.now()}.csv` };
  }),
});
