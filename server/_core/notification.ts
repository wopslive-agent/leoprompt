/**
 * Owner notification stub.
 * Replace with your preferred delivery method: email (Resend/Sendgrid),
 * SMS (Twilio), Slack webhook, etc.
 */

export type NotificationPayload = {
  title: string;
  content: string;
};

export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  // TODO: wire up your notification channel here
  console.log("[Notification] Owner alert:", payload.title, "-", payload.content);
  return true;
}
