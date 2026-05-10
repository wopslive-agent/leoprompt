import crypto from "crypto";
import axios from "axios";
import { ENV } from "./env";

export function verifyWebhookSecret(provided: string): boolean {
  const expected = ENV.textlinksmsWebhookSecret;
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function sendSms(to: string, body: string): Promise<void> {
  const apiKey = ENV.textlinksmsApiKey;
  if (!apiKey) {
    console.warn("[TextLinkSMS] Missing TEXTLINKSMS_API_KEY — skipping send");
    return;
  }
  const base = (ENV.textlinksmsApiBase || "https://textlinksms.com").replace(/\/$/, "");
  const payload: Record<string, unknown> = { phone_number: to, text: body };
  if (ENV.textlinksmsSimCardId) {
    payload.sim_card_id = ENV.textlinksmsSimCardId;
  }
  const res = await axios.post(`${base}/api/send-sms`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    timeout: 10_000,
    validateStatus: () => true,
  });
  const data = res.data as { ok?: boolean; message?: string } | undefined;
  if (res.status >= 400 || (data && data.ok === false)) {
    throw new Error(
      `TextLinkSMS send failed: ${res.status} ${JSON.stringify(data ?? {})}`
    );
  }
}
