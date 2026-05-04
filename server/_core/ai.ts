import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";
import type { Account } from "../../drizzle/schema";

// V3 canonical types — mirror canonical-output-schema.json

export type BookingType =
  | "private_in_home" | "event_party_appearance" | "bachelor_party"
  | "same_day" | "late_night" | "multi_hour" | "couples"
  | "men_only" | "mixed_group" | "solo_private" | "unknown";

export type MissingField =
  | "phone_number" | "event_date" | "full_address" | "booking_type"
  | "duration" | "guest_count" | "confirmed_18_plus" | "first_name"
  | "preferred_time" | "neighborhood" | "special_requests"
  | "parking_access_details" | "deposit_ready";

export type RiskFlag =
  | "none" | "age_unclear" | "recording_request" | "aggressive_tone"
  | "explicit_or_coded_request" | "out_of_area" | "venue_conflict"
  | "field_conflict" | "repeated_missing_info" | "suspicious_behavior"
  | "policy_review_required";

export type HandoffReason =
  | "none" | "qualified_lead" | "policy_review" | "rush_request"
  | "out_of_area_review" | "high_value_or_long_duration"
  | "deposit_or_pricing_exception" | "unusual_request"
  | "ambiguous_request" | "suspicious_behavior";

export type RejectionReason =
  | "none" | "unclear_or_underage" | "recording_request"
  | "aggressive_or_disrespectful" | "refused_required_details"
  | "disallowed_or_unsafe_request" | "policy_violation";

export type NextAction =
  | "answer_faq" | "ask_for_missing_fields" | "confirm_details"
  | "handoff_to_manager" | "reject_request" | "wait_for_user" | "no_reply";

export type ConversationStatus =
  | "new" | "faq_only" | "collecting_details" | "qualified"
  | "handoff_needed" | "human_review" | "awaiting_manager"
  | "rejected" | "closed";

export type ExtractedFields = {
  phoneNumber?: string;
  firstName?: string;
  eventDate?: string;
  preferredTime?: string;
  fullAddress?: string;
  neighborhood?: string;
  bookingType?: BookingType;
  duration?: string;
  guestCount?: string;
  confirmed18Plus?: "yes" | "no" | "unclear" | "unknown";
  depositReady?: "yes" | "no" | "unknown";
  specialRequests?: string;
  parkingAccessDetails?: string;
};

export type IntakeResult = {
  replyText: string;
  status: ConversationStatus;
  nextAction: NextAction;
  shouldSendReply: boolean;
  shouldHandoff: boolean;
  shouldReject: boolean;
  missingFields: MissingField[];
  askForFields?: MissingField[];
  extractedFields: ExtractedFields;
  riskFlags: RiskFlag[];
  handoffReason: HandoffReason;
  rejectionReason: RejectionReason;
  confidence: { overall: number; byField?: Record<string, number> };
  notesForManager?: string;
};

export class AIParseError extends Error {
  constructor(message: string, public readonly raw: unknown) {
    super(message);
    this.name = "AIParseError";
  }
}

export const STATIC_FALLBACK_REPLY =
  "Thanks for your message! A team member will follow up with you shortly.";

const MISSING_FIELD_ENUM = [
  "phone_number", "event_date", "full_address", "booking_type",
  "duration", "guest_count", "confirmed_18_plus", "first_name",
  "preferred_time", "neighborhood", "special_requests",
  "parking_access_details", "deposit_ready",
];

const RISK_FLAG_ENUM = [
  "none", "age_unclear", "recording_request", "aggressive_tone",
  "explicit_or_coded_request", "out_of_area", "venue_conflict",
  "field_conflict", "repeated_missing_info", "suspicious_behavior",
  "policy_review_required",
];

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Maps the raw snake_case tool/JSON output to the typed IntakeResult. */
export function mapRawToIntakeResult(inp: Record<string, unknown>): IntakeResult {
  const ef = (inp.extracted_fields ?? {}) as Record<string, unknown>;
  const conf = (inp.confidence ?? {}) as Record<string, unknown>;
  return {
    replyText: (inp.reply_text as string) || STATIC_FALLBACK_REPLY,
    status: (inp.status as ConversationStatus) ?? "new",
    nextAction: (inp.next_action as NextAction) ?? "wait_for_user",
    shouldSendReply: (inp.should_send_reply as boolean) ?? true,
    shouldHandoff: (inp.should_handoff as boolean) ?? false,
    shouldReject: (inp.should_reject as boolean) ?? false,
    missingFields: (inp.missing_fields as MissingField[]) ?? [],
    askForFields: inp.ask_for_fields as MissingField[] | undefined,
    extractedFields: {
      phoneNumber: ef.phone_number as string | undefined,
      firstName: ef.first_name as string | undefined,
      eventDate: ef.event_date as string | undefined,
      preferredTime: ef.preferred_time as string | undefined,
      fullAddress: ef.full_address as string | undefined,
      neighborhood: ef.neighborhood as string | undefined,
      bookingType: ef.booking_type as BookingType | undefined,
      duration: ef.duration as string | undefined,
      guestCount: ef.guest_count as string | undefined,
      confirmed18Plus: ef.confirmed_18_plus as ExtractedFields["confirmed18Plus"],
      depositReady: ef.deposit_ready as ExtractedFields["depositReady"],
      specialRequests: ef.special_requests as string | undefined,
      parkingAccessDetails: ef.parking_access_details as string | undefined,
    },
    riskFlags: (inp.risk_flags as RiskFlag[]) ?? ["none"],
    handoffReason: (inp.handoff_reason as HandoffReason) ?? "none",
    rejectionReason: (inp.rejection_reason as RejectionReason) ?? "none",
    confidence: {
      overall: typeof conf.overall === "number" ? conf.overall : 0.5,
      byField: conf.by_field as Record<string, number> | undefined,
    },
    notesForManager: inp.notes_for_manager as string | undefined,
  };
}

// ── System prompt ───────────────────────────────────────────────────────────

function buildExamplesSection(account: Account): string {
  const raw = (account as any).trainingExamples;
  if (!raw || !Array.isArray(raw)) return "";
  const active = (raw as Array<{ customerMessage?: string; idealResponse?: string; active?: boolean }>)
    .filter((e) => e.active && e.customerMessage && e.idealResponse);
  if (active.length === 0) return "";
  return (
    "\nRESPONSE EXAMPLES (calibrate tone and phrasing from these):\n" +
    active.map((e) => `Customer: ${e.customerMessage}\nYou: ${e.idealResponse}`).join("\n\n") +
    "\n"
  );
}

export function buildSystemPrompt(account: Account): string {
  return `You are Leoprompt Concierge, the premium booking-intake assistant for ${account.businessName}.

Your job is to produce a safe, structured decision for the workflow — not just write a reply.
ALWAYS call the record_intent tool. Never reply with plain text.

DECISION PRIORITIES:
1. safety and compliance
2. correct classification
3. correct field extraction
4. correct handoff behavior
5. polished premium tone

OPERATING LANE (allowed):
- legal booking intake and basic logistics
- availability-style questions
- location, date, duration, guest-count collection
- discreet reassurance at a high level
- escalation to human manager when needed

OPERATING LANE (not allowed):
- explicit sexual-service negotiation
- illegal promises or coded assurances
- coercive, unsafe, or recording-related requests
- unclear-age conversations
- extended non-booking chat

BEHAVIOR RULES:
- speak like a polished human assistant, not like a bot
- use first person, stay brief — usually 2–4 short lines
- remain discreet, calm, premium, and efficient
- light emoji use is allowed but not required
- never argue, beg, or overexplain
- never claim anything is approved unless a human approved it
- never confirm availability unless the workflow or a human confirmed it
- if a message could be explicit, illegal, or coded — do not clarify it in detail; decline or escalate

SERVICES OFFERED:
${account.servicesOffered || "Contact us to learn about our services."}

PRICING:
${account.pricing || "Contact us for pricing details."}

AVAILABILITY:
${account.availability || "Contact us to check availability."}
${account.aiPersona ? `\nSPECIAL INSTRUCTIONS:\n${account.aiPersona}\n` : ""}${buildExamplesSection(account)}
REQUIRED FIELDS FOR QUALIFICATION (all seven must be present):
phone_number, event_date, full_address, booking_type, duration, guest_count, confirmed_18_plus=yes

FIELD COLLECTION RULES:
- ask only for the next most important missing fields — usually 1–3 per turn (use ask_for_fields)
- do not repeat the full checklist every turn unless necessary
- use next_action="confirm_details" only when every required field is collected
- use next_action="handoff_to_manager" for qualified leads, unusual, sensitive, or policy-review cases
- use next_action="ask_for_missing_fields" while still collecting
- use next_action="reject_request" for spam, abuse, unclear-age, recording-request, or policy violations
- use next_action="no_reply" only when the conversation is clearly finished

REJECTION RULES — set should_reject=true and reject_request:
- user is rude or aggressive beyond acceptable threshold
- age is unclear or user may be under 18
- recording is requested
- user refuses required details repeatedly
- request is clearly disallowed, unsafe, or out of lane

HANDOFF LINE (exact wording, use when escalating):
"I'm confirming this with my booking manager."`;
}

// ── Anthropic path ──────────────────────────────────────────────────────────

const RECORD_INTENT_TOOL: Anthropic.Tool = {
  name: "record_intent",
  description:
    "Record structured output for this SMS conversation turn. Always call this tool — never reply with plain text.",
  input_schema: {
    type: "object" as const,
    required: [
      "reply_text", "status", "next_action",
      "should_send_reply", "should_handoff", "should_reject",
      "missing_fields", "extracted_fields", "risk_flags",
      "handoff_reason", "rejection_reason", "confidence",
    ],
    properties: {
      reply_text: { type: "string", description: "SMS reply. Under 160 chars when possible. Max 600." },
      status: {
        type: "string",
        enum: ["new","faq_only","collecting_details","qualified","handoff_needed","human_review","awaiting_manager","rejected","closed"],
      },
      next_action: {
        type: "string",
        enum: ["answer_faq","ask_for_missing_fields","confirm_details","handoff_to_manager","reject_request","wait_for_user","no_reply"],
      },
      should_send_reply: { type: "boolean" },
      should_handoff: { type: "boolean" },
      should_reject: { type: "boolean" },
      missing_fields: { type: "array", items: { type: "string", enum: MISSING_FIELD_ENUM }, uniqueItems: true },
      ask_for_fields: { type: "array", items: { type: "string", enum: MISSING_FIELD_ENUM }, maxItems: 4, uniqueItems: true },
      extracted_fields: {
        type: "object",
        additionalProperties: false,
        properties: {
          phone_number: { type: "string" },
          first_name: { type: "string" },
          event_date: { type: "string" },
          preferred_time: { type: "string" },
          full_address: { type: "string" },
          neighborhood: { type: "string" },
          booking_type: { type: "string", enum: ["private_in_home","event_party_appearance","bachelor_party","same_day","late_night","multi_hour","couples","men_only","mixed_group","solo_private","unknown"] },
          duration: { type: "string" },
          guest_count: { type: "string" },
          confirmed_18_plus: { type: "string", enum: ["yes","no","unclear","unknown"] },
          deposit_ready: { type: "string", enum: ["yes","no","unknown"] },
          special_requests: { type: "string" },
          parking_access_details: { type: "string" },
        },
      },
      risk_flags: { type: "array", items: { type: "string", enum: RISK_FLAG_ENUM }, uniqueItems: true },
      handoff_reason: { type: "string", enum: ["none","qualified_lead","policy_review","rush_request","out_of_area_review","high_value_or_long_duration","deposit_or_pricing_exception","unusual_request","ambiguous_request","suspicious_behavior"] },
      rejection_reason: { type: "string", enum: ["none","unclear_or_underage","recording_request","aggressive_or_disrespectful","refused_required_details","disallowed_or_unsafe_request","policy_violation"] },
      confidence: {
        type: "object",
        required: ["overall"],
        properties: {
          overall: { type: "number", minimum: 0, maximum: 1 },
          by_field: { type: "object", additionalProperties: { type: "number", minimum: 0, maximum: 1 } },
        },
      },
      notes_for_manager: { type: "string" },
    },
  },
};

async function runIntakeAnthropic(
  account: Account,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  newUserMessage: string
): Promise<IntakeResult> {
  const client = new Anthropic({ apiKey: ENV.anthropicApiKey });
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: newUserMessage },
  ];

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      // Cache the system prompt — saves ~60-80% of input tokens on repeat turns
      system: [{ type: "text" as const, text: buildSystemPrompt(account), cache_control: { type: "ephemeral" as const } }],
      tools: [RECORD_INTENT_TOOL],
      tool_choice: { type: "tool", name: "record_intent" },
      messages,
    });
  } catch (err) {
    throw new AIParseError("Anthropic API call failed", err);
  }

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolBlock) {
    throw new AIParseError("Model did not call record_intent", response.content);
  }

  return mapRawToIntakeResult(toolBlock.input as Record<string, unknown>);
}

// ── Ollama path ─────────────────────────────────────────────────────────────

// Appended to the system prompt when using Ollama. Instructs the model to
// output a JSON object instead of calling a tool (Ollama does not support
// Anthropic-style forced tool use).
const OLLAMA_JSON_INSTRUCTION = `

OUTPUT FORMAT — respond ONLY with a single JSON object. No markdown, no explanation, no wrapper.
Required fields:
  reply_text          string   (SMS reply, ≤160 chars preferred, max 600)
  status              one of: new | faq_only | collecting_details | qualified | handoff_needed | human_review | awaiting_manager | rejected | closed
  next_action         one of: answer_faq | ask_for_missing_fields | confirm_details | handoff_to_manager | reject_request | wait_for_user | no_reply
  should_send_reply   boolean
  should_handoff      boolean
  should_reject       boolean
  missing_fields      array of: phone_number | event_date | full_address | booking_type | duration | guest_count | confirmed_18_plus | first_name | preferred_time | neighborhood | special_requests | parking_access_details | deposit_ready
  ask_for_fields      array (subset of missing_fields, max 4)
  extracted_fields    object with any known fields: phone_number, first_name, event_date, preferred_time, full_address, neighborhood, booking_type, duration, guest_count, confirmed_18_plus (yes|no|unclear|unknown), deposit_ready (yes|no|unknown), special_requests, parking_access_details
  risk_flags          array — at minimum ["none"]
  handoff_reason      one of: none | qualified_lead | policy_review | rush_request | out_of_area_review | high_value_or_long_duration | deposit_or_pricing_exception | unusual_request | ambiguous_request | suspicious_behavior
  rejection_reason    one of: none | unclear_or_underage | recording_request | aggressive_or_disrespectful | refused_required_details | disallowed_or_unsafe_request | policy_violation
  confidence          object: { "overall": 0.0–1.0 }
Optional fields:
  notes_for_manager   string
Omit optional fields rather than setting them to null.`;

/** Exported for unit tests. Use runIntake() in production. */
export async function runIntakeOllama(
  account: Account,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  newUserMessage: string
): Promise<IntakeResult> {
  const systemPrompt = buildSystemPrompt(account) + OLLAMA_JSON_INSTRUCTION;
  const chatMessages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: newUserMessage },
  ];

  const MAX_RETRIES = 3;
  let lastParseErr: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let rawContent: string;
    try {
      const res = await fetch(`${ENV.ollamaBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ENV.ollamaModel,
          stream: false,
          format: "json",
          messages: [{ role: "system", content: systemPrompt }, ...chatMessages],
        }),
      });
      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { message?: { content?: string } };
      rawContent = data.message?.content ?? "";
    } catch (err) {
      throw new AIParseError("Ollama API call failed", err);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawContent) as Record<string, unknown>;
    } catch (err) {
      lastParseErr = err;
      continue; // retry — model occasionally emits partial JSON on first attempt
    }

    return mapRawToIntakeResult(parsed);
  }

  throw new AIParseError("Ollama returned invalid JSON after retries", lastParseErr);
}

// ── Public entry point ──────────────────────────────────────────────────────

export async function runIntake(
  account: Account,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  newUserMessage: string
): Promise<IntakeResult> {
  if (ENV.aiProvider === "ollama") {
    return runIntakeOllama(account, history, newUserMessage);
  }
  return runIntakeAnthropic(account, history, newUserMessage);
}
