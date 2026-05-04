import crypto from "crypto";
import axios from "axios";
import { ENV } from "./env";

/**
 * Validate a Twilio webhook request using HMAC-SHA1.
 * Algorithm: sign (url + sorted-params-concatenated) with authToken, compare to header.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  twilioSignature: string
): boolean {
  const authToken = ENV.twilioAuthToken;
  if (!authToken || !twilioSignature) return false;

  // Sort params alphabetically, then concatenate key+value (no separator)
  const sorted = Object.keys(params).sort();
  const paramString = sorted.reduce((acc, key) => acc + key + (params[key] ?? ""), "");
  const signingString = url + paramString;

  const hmac = crypto.createHmac("sha1", authToken);
  hmac.update(signingString, "utf8");
  const computed = hmac.digest("base64");

  // timingSafeEqual requires equal-length buffers; bail early if lengths differ
  const computedBuf = Buffer.from(computed);
  const signatureBuf = Buffer.from(twilioSignature);
  if (computedBuf.length !== signatureBuf.length) return false;

  return crypto.timingSafeEqual(computedBuf, signatureBuf);
}

/**
 * Detect the channel from a Twilio phone number string.
 * Twilio prefixes WhatsApp numbers with "whatsapp:".
 */
export function extractChannel(phone: string): "sms" | "whatsapp" {
  return phone.startsWith("whatsapp:") ? "whatsapp" : "sms";
}

/**
 * Strip the "whatsapp:" prefix (if present) to get the bare E.164 number.
 */
export function normalizePhone(phone: string): string {
  return phone.startsWith("whatsapp:") ? phone.slice("whatsapp:".length) : phone;
}

async function twilioPost(to: string, body: string, from: string): Promise<void> {
  const { twilioAccountSid, twilioAuthToken } = ENV;
  if (!twilioAccountSid || !twilioAuthToken) {
    console.warn("[Twilio] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN — skipping send");
    return;
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
  await axios.post(
    url,
    new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      auth: { username: twilioAccountSid, password: twilioAuthToken },
      timeout: 10_000,
    }
  );
}

/**
 * Send an SMS via the Twilio REST API.
 */
export async function sendSms(to: string, body: string, from: string): Promise<void> {
  await twilioPost(to, body, from);
}

/**
 * Send a WhatsApp message via the Twilio REST API.
 * Both `to` and `from` must be bare E.164 numbers — this function adds the prefix.
 */
export async function sendWhatsApp(to: string, body: string, from: string): Promise<void> {
  const waTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const waFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  await twilioPost(waTo, body, waFrom);
}

/**
 * Send via the correct channel (sms or whatsapp) automatically.
 */
export async function sendMessage(
  channel: "sms" | "whatsapp",
  to: string,
  body: string,
  from: string
): Promise<void> {
  if (channel === "whatsapp") {
    await sendWhatsApp(to, body, from);
  } else {
    await sendSms(to, body, from);
  }
}
