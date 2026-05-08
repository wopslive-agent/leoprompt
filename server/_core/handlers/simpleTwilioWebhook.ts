import type { Request, Response } from "express";
import { ENV } from "../env";
import { validateTwilioSignature } from "../twilio";

const SIMPLE_CONCIERGE_PROMPT = `You are Leoprompt Concierge, a premium booking assistant for legal adult entertainment in the Greater Toronto Area.

Tone:
- polished
- feminine
- high-status
- discreet
- brief
- first-person
- light emoji use only

Your job:
- answer simple booking questions
- collect required booking details
- screen for fit and safety
- hand qualified or sensitive leads to the booking manager

Required details:
- phone number
- event date
- full address
- booking type
- duration
- number of guests
- confirmation that all attendees are 18+

Optional details:
- first name
- preferred time
- neighborhood
- special requests
- parking/access details

Allowed:
- private in-home booking
- event or party appearance
- bachelor party
- same-day booking if available
- late-night booking
- multi-hour booking
- couples booking
- men-only party
- mixed group party
- solo private booking

Not allowed:
- hotel booking
- club appearance
- women-only party

Rules:
- keep replies short, usually 2 to 4 lines
- never sound robotic
- never argue
- never overexplain
- never discuss explicit sex acts or illegal services
- if qualified, sensitive, unusual, unclear, or ready for next step, include exactly: "I'm confirming this with my booking manager."
- if rude, suspicious, unclear age, asks to record, or refuses required details, decline briefly and professionally
- if outside your lane, redirect back to booking details or handoff cleanly`;

const FALLBACK_REPLY =
  "Thanks for reaching out. Please send the date, address, booking type, duration, guest count, and confirm everyone is 18+. I'm confirming this with my booking manager.";

function getWebhookUrl(req: Request): string {
  const base =
    ENV.webhookBaseUrl ||
    `${req.headers["x-forwarded-proto"] ?? req.protocol}://${req.headers["x-forwarded-host"] ?? req.get("host")}`;
  return `${base}${req.originalUrl}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toSmsLength(value: string): string {
  const cleaned = value.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned.length > 1400 ? `${cleaned.slice(0, 1397).trim()}...` : cleaned;
}

async function generateReply(messageBody: string): Promise<string> {
  const response = await fetch(`${ENV.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ENV.ollamaModel,
      stream: false,
      messages: [
        { role: "system", content: SIMPLE_CONCIERGE_PROMPT },
        { role: "user", content: messageBody },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { message?: { content?: string } };
  return toSmsLength(data.message?.content || FALLBACK_REPLY);
}

/**
 * POST /api/webhook/simple-twilio
 *
 * Minimal Twilio responder:
 *   validate Twilio signature -> call Ollama with the concierge prompt
 *   -> return TwiML with a direct SMS reply.
 *
 * This intentionally skips account lookup, persistence, lead state, billing,
 * notifications, and Twilio REST sends. Use it when you want a simple reply bot.
 */
export async function handleSimpleTwilioWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const params = req.body as Record<string, string>;
  const signature = (req.headers["x-twilio-signature"] as string) ?? "";
  const url = getWebhookUrl(req);

  if (!validateTwilioSignature(url, params, signature)) {
    console.warn(
      "[SimpleWebhook] Rejected: invalid Twilio signature. URL used:",
      url
    );
    res.status(403).send("Forbidden");
    return;
  }

  const messageBody = (params.Body ?? "").trim();
  if (!messageBody) {
    res
      .set("Content-Type", "text/xml")
      .status(200)
      .send(`<Response><Message>${escapeXml(FALLBACK_REPLY)}</Message></Response>`);
    return;
  }

  let reply = FALLBACK_REPLY;
  try {
    reply = await generateReply(messageBody);
  } catch (error) {
    console.error("[SimpleWebhook] Ollama reply failed:", error);
  }

  res
    .set("Content-Type", "text/xml")
    .status(200)
    .send(`<Response><Message>${escapeXml(reply)}</Message></Response>`);
}
