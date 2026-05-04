import {
  getDueFollowUpJobs,
  updateFollowUpJobStatus,
  getAccountById,
} from "../db";
import { sendMessage } from "./twilio";
import type { FollowUpJob } from "../../drizzle/schema";

const POLL_INTERVAL_MS = 60_000; // poll every 60 seconds
let _intervalId: ReturnType<typeof setInterval> | null = null;

function buildFollowUpMessage(job: FollowUpJob, businessName: string): string {
  switch (job.jobType) {
    case "no_reply_2h":
      return `Hi! Just following up from ${businessName}. Did you have any questions about your booking inquiry? We're here to help.`;
    case "no_reply_24h":
      return `Hi again! This is ${businessName} — we wanted to make sure your inquiry didn't slip through the cracks. Reply anytime to pick up where we left off.`;
    case "appointment_reminder_24h":
      return `Reminder from ${businessName}: your booking is tomorrow! Reply if you have any last-minute questions.`;
    case "appointment_reminder_1h":
      return `Heads up from ${businessName}: your booking is in about 1 hour. See you soon!`;
    default:
      return `Following up from ${businessName}. Let us know if you need anything.`;
  }
}

async function processJob(job: FollowUpJob): Promise<void> {
  try {
    // Fetch account to get business name and the right phone number
    const account = await getAccountById(job.accountId);
    if (!account) {
      await updateFollowUpJobStatus(job.id, "cancelled");
      return;
    }

    // Don't send if follow-up is disabled for the account
    if (!account.followUpEnabled) {
      await updateFollowUpJobStatus(job.id, "cancelled");
      return;
    }

    const fromPhone =
      job.channel === "whatsapp"
        ? account.whatsappPhoneNumber
        : account.twilioPhoneNumber;

    if (!fromPhone) {
      console.warn(`[FollowUp] Account ${job.accountId} has no ${job.channel} phone — cancelling job ${job.id}`);
      await updateFollowUpJobStatus(job.id, "cancelled");
      return;
    }

    const body = buildFollowUpMessage(job, account.businessName);

    await sendMessage(job.channel, job.customerPhone, body, fromPhone);
    await updateFollowUpJobStatus(job.id, "sent", new Date());
    console.info(
      `[FollowUp] Sent ${job.jobType} to ${job.customerPhone} via ${job.channel} (job ${job.id})`
    );
  } catch (err) {
    console.error(`[FollowUp] Failed to process job ${job.id}:`, err);
    // Don't mark as cancelled — it will be retried on next poll
  }
}

async function tick(): Promise<void> {
  try {
    const dueJobs = await getDueFollowUpJobs(new Date());
    if (dueJobs.length === 0) return;

    console.info(`[FollowUp] Processing ${dueJobs.length} due job(s)`);
    await Promise.allSettled(dueJobs.map(processJob));
  } catch (err) {
    console.error("[FollowUp] Scheduler tick error:", err);
  }
}

/**
 * Start the in-process follow-up scheduler.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startFollowUpScheduler(): void {
  if (_intervalId !== null) return;
  _intervalId = setInterval(() => {
    tick().catch(err => console.error("[FollowUp] Unexpected scheduler error:", err));
  }, POLL_INTERVAL_MS);
  console.info(`[FollowUp] Scheduler started (poll every ${POLL_INTERVAL_MS / 1000}s)`);
}

export function stopFollowUpScheduler(): void {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}
