import type {
  ExtractedFields,
  HandoffReason,
  IntakeResult,
  NextAction,
  RiskFlag,
} from "./ai";

export const SMS_SAFETY_HANDOFF_REPLY =
  "I'm confirming this with my booking manager.";

export type SmsSafetyReason =
  | "prompt_injection"
  | "explicit_or_coded_request"
  | "illegal_or_unsafe_request"
  | "ambiguous_coded_escalation";

export type SmsSafetySignal = {
  reason: SmsSafetyReason;
  pattern: string;
  excerpt: string;
};

export type SmsSafetyAssessment = {
  shouldEscalate: boolean;
  nextAction: NextAction;
  shouldHandoff: boolean;
  shouldReject: boolean;
  riskFlags: RiskFlag[];
  handoffReason: HandoffReason;
  reasons: SmsSafetyReason[];
  signals: SmsSafetySignal[];
  replyText?: string;
  notesForManager?: string;
};

export type PromptInjectionAssessment = {
  detected: boolean;
  signals: SmsSafetySignal[];
};

export type ExtractedFieldName = keyof ExtractedFields;

export type FieldConflict = {
  field: ExtractedFieldName;
  label: string;
  previousValue: string;
  newValue: string;
};

export type FieldConflictAssessment = {
  hasConflict: boolean;
  shouldRequestReconfirmation: boolean;
  nextAction: NextAction;
  riskFlags: RiskFlag[];
  handoffReason: HandoffReason;
  conflicts: FieldConflict[];
  fieldsToConfirm: ExtractedFieldName[];
  replyText?: string;
  notesForManager?: string;
};

type SmsPattern = {
  reason: SmsSafetyReason;
  label: string;
  regex: RegExp;
};

const MAX_EXCERPT_LENGTH = 80;

const PROMPT_INJECTION_PATTERNS: SmsPattern[] = [
  {
    reason: "prompt_injection",
    label: "override_instructions",
    regex:
      /\b(?:ignore|disregard|forget|bypass|override|skip)\b.{0,48}\b(?:system|developer|previous|prior|all|your)\b.{0,32}\b(?:instructions?|rules?|polic(?:y|ies)|constraints?|guardrails?)\b/i,
  },
  {
    reason: "prompt_injection",
    label: "instruction_override",
    regex:
      /\b(?:system|developer|previous|prior)\b.{0,32}\b(?:instructions?|rules?|polic(?:y|ies))\b.{0,48}\b(?:no longer apply|are disabled|do not apply|are fake|are wrong)\b/i,
  },
  {
    reason: "prompt_injection",
    label: "prompt_exfiltration",
    regex:
      /\b(?:show|reveal|print|send|dump|quote|repeat|tell me)\b.{0,40}\b(?:system prompt|developer prompt|hidden prompt|initial prompt|instructions?|tool schema|json schema)\b/i,
  },
  {
    reason: "prompt_injection",
    label: "generic_prompt_exfiltration",
    regex:
      /\b(?:show|reveal|print|send|dump|quote|repeat|tell me)\b.{0,40}\b(?:your prompt|the prompt|prompts?)\b/i,
  },
  {
    reason: "prompt_injection",
    label: "tool_or_schema_override",
    regex:
      /\b(?:change|modify|ignore|bypass|skip|disable|do not use|don't use|never call|avoid)\b.{0,48}\b(?:json|schema|tool|record_intent|tool call|function call|output format)\b/i,
  },
  {
    reason: "prompt_injection",
    label: "forced_structured_output",
    regex:
      /\b(?:return|respond|output|send)\b.{0,24}\b(?:raw )?(?:json|xml|yaml|tool output|function call)\b.{0,48}\b(?:instead|only|with no text|without explanation)\b/i,
  },
  {
    reason: "prompt_injection",
    label: "safety_policy_override",
    regex:
      /\b(?:ignore|bypass|disable|turn off|skip)\b.{0,48}\b(?:safety|policy|policies|compliance|moderation|risk flags?|handoff)\b/i,
  },
  {
    reason: "prompt_injection",
    label: "platform_impersonation",
    regex:
      /\b(?:this is|i am|as)\b.{0,24}\b(?:system|developer|admin|administrator|operator|platform|twilio|openai|anthropic)\b.{0,36}\b(?:message|instruction|override|command|policy|support)\b/i,
  },
  {
    reason: "prompt_injection",
    label: "platform_prefix_impersonation",
    regex:
      /(?:^|\b)(?:system|developer|admin|administrator|operator|platform|twilio|openai|anthropic)\s*[:>-]\s*.{0,80}\b(?:ignore|override|bypass|set|mark|return|respond|policy|instructions?)\b/i,
  },
  {
    reason: "prompt_injection",
    label: "role_takeover",
    regex:
      /\b(?:you are now|act as|pretend to be|switch to|enter)\b.{0,48}\b(?:developer mode|admin mode|operator mode|system mode|jailbreak|dan)\b/i,
  },
  {
    reason: "prompt_injection",
    label: "field_or_risk_override",
    regex:
      /\b(?:set|mark|make)\b.{0,32}\b(?:risk_flags?|handoff_reason|should_handoff|should_reject|next_action|schema_valid)\b.{0,32}\b(?:none|false|true|qualified|confirm_details|no_reply)\b/i,
  },
  {
    reason: "prompt_injection",
    label: "jailbreak",
    regex:
      /\b(?:prompt injection|jailbreak|do anything now|dan mode|developer mode)\b/i,
  },
];

const ESCALATION_PATTERNS: SmsPattern[] = [
  {
    reason: "explicit_or_coded_request",
    label: "sexual_service_negotiation",
    regex:
      /\b(?:full service|happy ending|extras?|extra menu|special menu|gfe|girlfriend experience|bareback|bbbj|daty|greek|covered or uncovered|no condom|without condom|raw service)\b/i,
  },
  {
    reason: "explicit_or_coded_request",
    label: "explicit_contact_or_acts",
    regex:
      /\b(?:sex|sexual|oral|anal|hand job|blow ?job|bj|hentai|nude|naked|escort)\b.{0,36}\b(?:included|available|allowed|okay|ok|extra|price|cost|menu|service)\b/i,
  },
  {
    reason: "explicit_or_coded_request",
    label: "discretionary_coded_request",
    regex:
      /\b(?:anything goes|open minded|no limits|off menu|under the table|code word|coded|discreet arrangement|private arrangement)\b/i,
  },
  {
    reason: "illegal_or_unsafe_request",
    label: "illegal_substances",
    regex:
      /\b(?:cocaine|coke|blow|molly|mdma|ketamine|xanax|party favors?|white powder|hard drugs?)\b/i,
  },
  {
    reason: "illegal_or_unsafe_request",
    label: "weapons_or_threats",
    regex:
      /\b(?:gun|knife|weapon|armed|hurt someone|rough them up|threaten|blackmail)\b/i,
  },
  {
    reason: "illegal_or_unsafe_request",
    label: "minor_or_underage",
    regex:
      /\b(?:under ?age|minor|under 18|under eighteen|(?:1[0-7])\s*(?:yo|y\/o|years? old))\b/i,
  },
  {
    reason: "ambiguous_coded_escalation",
    label: "coded_rates_or_menu",
    regex:
      /\b(?:menu|roses?|donation|damage|tribute|tip)\b.{0,24}\b(?:for|to include|with)\b.{0,32}\b(?:extras?|full|all inclusive|everything|special)\b/i,
  },
  {
    reason: "ambiguous_coded_escalation",
    label: "ambiguous_initials",
    regex:
      /\b(?:fs|hh|bb|bbbj|gfe|cbj|hj|bj|daty|dfk)\b(?:\??| available| included| extra| menu| rate| price)\b/i,
  },
];

const FIELD_LABELS: Record<ExtractedFieldName, string> = {
  phoneNumber: "phone number",
  firstName: "name",
  eventDate: "date",
  preferredTime: "time",
  fullAddress: "address",
  neighborhood: "neighborhood",
  bookingType: "booking type",
  duration: "duration",
  guestCount: "guest count",
  confirmed18Plus: "18+ confirmation",
  depositReady: "deposit readiness",
  specialRequests: "special requests",
  parkingAccessDetails: "parking/access details",
};

const SNAKE_TO_CAMEL_FIELD: Record<string, ExtractedFieldName> = {
  phone_number: "phoneNumber",
  first_name: "firstName",
  event_date: "eventDate",
  preferred_time: "preferredTime",
  full_address: "fullAddress",
  neighborhood: "neighborhood",
  booking_type: "bookingType",
  duration: "duration",
  guest_count: "guestCount",
  confirmed_18_plus: "confirmed18Plus",
  deposit_ready: "depositReady",
  special_requests: "specialRequests",
  parking_access_details: "parkingAccessDetails",
};

const MATERIAL_EMPTY_VALUES = new Set([
  "",
  "unknown",
  "unclear",
  "n/a",
  "na",
  "none",
  "null",
]);

export function detectPromptInjection(body: string): PromptInjectionAssessment {
  const signals = collectSignals(body, PROMPT_INJECTION_PATTERNS);

  return {
    detected: signals.length > 0,
    signals,
  };
}

export function classifyInboundSmsSafety(body: string): SmsSafetyAssessment {
  const promptSignals = detectPromptInjection(body).signals;
  const escalationSignals = collectSignals(body, ESCALATION_PATTERNS);
  const signals = dedupeSignals([...promptSignals, ...escalationSignals]);
  const reasons = unique(signals.map(signal => signal.reason));

  if (signals.length === 0) {
    return {
      shouldEscalate: false,
      nextAction: "wait_for_user",
      shouldHandoff: false,
      shouldReject: false,
      riskFlags: ["none"],
      handoffReason: "none",
      reasons: [],
      signals: [],
    };
  }

  const riskFlags = new Set<RiskFlag>(["policy_review_required"]);
  if (reasons.includes("prompt_injection")) {
    riskFlags.add("suspicious_behavior");
  }
  if (
    reasons.includes("explicit_or_coded_request") ||
    reasons.includes("ambiguous_coded_escalation")
  ) {
    riskFlags.add("explicit_or_coded_request");
  }
  if (reasons.includes("illegal_or_unsafe_request")) {
    riskFlags.add("suspicious_behavior");
  }

  return {
    shouldEscalate: true,
    nextAction: "handoff_to_manager",
    shouldHandoff: true,
    shouldReject: false,
    riskFlags: Array.from(riskFlags),
    handoffReason: chooseSafetyHandoffReason(reasons),
    reasons,
    signals,
    replyText: SMS_SAFETY_HANDOFF_REPLY,
    notesForManager: buildSafetyNotes(signals),
  };
}

export function buildSmsSafetyHandoffResult(
  assessment: SmsSafetyAssessment,
  extractedFields: Partial<ExtractedFields> = {}
): IntakeResult | undefined {
  if (!assessment.shouldEscalate) return undefined;

  return {
    replyText: assessment.replyText ?? SMS_SAFETY_HANDOFF_REPLY,
    status: "human_review",
    nextAction: "handoff_to_manager",
    shouldSendReply: true,
    shouldHandoff: true,
    shouldReject: false,
    missingFields: [],
    extractedFields,
    riskFlags: assessment.riskFlags,
    handoffReason: assessment.handoffReason,
    rejectionReason: "none",
    confidence: { overall: 1 },
    notesForManager: assessment.notesForManager,
  };
}

export function detectFieldConflicts(
  previousFields: unknown,
  nextFields: unknown
): FieldConflictAssessment {
  const previous = coerceExtractedFields(previousFields);
  const next = coerceExtractedFields(nextFields);
  const conflicts: FieldConflict[] = [];

  for (const field of Object.keys(FIELD_LABELS) as ExtractedFieldName[]) {
    const previousValue = previous[field];
    const nextValue = next[field];

    if (
      !isMaterialFieldValue(previousValue) ||
      !isMaterialFieldValue(nextValue)
    ) {
      continue;
    }

    const previousComparable = normalizeFieldValue(field, previousValue);
    const nextComparable = normalizeFieldValue(field, nextValue);
    if (previousComparable === nextComparable) {
      continue;
    }

    conflicts.push({
      field,
      label: FIELD_LABELS[field],
      previousValue: String(previousValue).trim(),
      newValue: String(nextValue).trim(),
    });
  }

  if (conflicts.length === 0) {
    return {
      hasConflict: false,
      shouldRequestReconfirmation: false,
      nextAction: "wait_for_user",
      riskFlags: ["none"],
      handoffReason: "none",
      conflicts: [],
      fieldsToConfirm: [],
    };
  }

  return {
    hasConflict: true,
    shouldRequestReconfirmation: true,
    nextAction: "ask_for_missing_fields",
    riskFlags: ["field_conflict"],
    handoffReason: "none",
    conflicts,
    fieldsToConfirm: conflicts.map(conflict => conflict.field),
    replyText: buildConflictReply(conflicts),
    notesForManager: buildConflictNotes(conflicts),
  };
}

export function applyFieldConflictToIntakeResult(
  result: IntakeResult,
  conflictAssessment: FieldConflictAssessment
): IntakeResult {
  if (!conflictAssessment.hasConflict) return result;

  return {
    ...result,
    status: "collecting_details",
    replyText: conflictAssessment.replyText ?? result.replyText,
    nextAction: conflictAssessment.nextAction,
    shouldSendReply: true,
    shouldHandoff: false,
    shouldReject: false,
    riskFlags: mergeRiskFlags(result.riskFlags, conflictAssessment.riskFlags),
    handoffReason: "none",
    rejectionReason: "none",
    notesForManager: mergeNotes(
      result.notesForManager,
      conflictAssessment.notesForManager
    ),
  };
}

export function coerceExtractedFields(
  fields: unknown
): Partial<ExtractedFields> {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return {};
  }

  const raw = fields as Record<string, unknown>;
  const nested = raw.currentState ?? raw.extractedFields;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return coerceExtractedFields(nested);
  }

  const coerced: Partial<ExtractedFields> = {};

  for (const field of Object.keys(FIELD_LABELS) as ExtractedFieldName[]) {
    const value = coerceFieldValue(raw[field]);
    if (value !== undefined) {
      coerced[field] = value as never;
    }
  }

  for (const [snakeKey, camelKey] of Object.entries(SNAKE_TO_CAMEL_FIELD)) {
    if (coerced[camelKey] !== undefined) continue;

    const value = coerceFieldValue(raw[snakeKey]);
    if (value !== undefined) {
      coerced[camelKey] = value as never;
    }
  }

  return coerced;
}

function coerceFieldValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return undefined;
}

function collectSignals(
  body: string,
  patterns: SmsPattern[]
): SmsSafetySignal[] {
  if (!body.trim()) return [];

  const signals: SmsSafetySignal[] = [];
  for (const pattern of patterns) {
    const match = body.match(pattern.regex);
    if (!match || match.index === undefined) continue;

    signals.push({
      reason: pattern.reason,
      pattern: pattern.label,
      excerpt: excerptForMatch(body, match.index, match[0].length),
    });
  }

  return signals;
}

function dedupeSignals(signals: SmsSafetySignal[]): SmsSafetySignal[] {
  const seen = new Set<string>();
  const deduped: SmsSafetySignal[] = [];

  for (const signal of signals) {
    const key = `${signal.reason}:${signal.pattern}:${signal.excerpt.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(signal);
  }

  return deduped;
}

function excerptForMatch(body: string, index: number, length: number): string {
  const start = Math.max(0, index - 16);
  const end = Math.min(body.length, index + length + 16);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < body.length ? "..." : "";

  return `${prefix}${body.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`.slice(
    0,
    MAX_EXCERPT_LENGTH
  );
}

function chooseSafetyHandoffReason(reasons: SmsSafetyReason[]): HandoffReason {
  if (reasons.includes("prompt_injection")) {
    return "suspicious_behavior";
  }
  if (reasons.includes("ambiguous_coded_escalation")) {
    return "ambiguous_request";
  }
  if (reasons.includes("illegal_or_unsafe_request")) {
    return "policy_review";
  }
  return "unusual_request";
}

function buildSafetyNotes(signals: SmsSafetySignal[]): string {
  const summaries = signals.map(
    signal => `${signal.reason}/${signal.pattern}: "${signal.excerpt}"`
  );
  return `SMS safety pre-check escalated before AI intake. Signals: ${summaries.join("; ")}`;
}

function isMaterialFieldValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return !MATERIAL_EMPTY_VALUES.has(value.trim().toLowerCase());
}

function normalizeFieldValue(field: ExtractedFieldName, value: string): string {
  const normalized = value.trim().toLowerCase();

  switch (field) {
    case "phoneNumber":
      return normalizePhoneComparable(normalized);
    case "eventDate":
      return normalized.replace(/\b0+(\d)\b/g, "$1");
    case "preferredTime":
      return normalizeTime(normalized);
    case "duration":
      return normalized
        .replace(/\bhours?\b/g, "hr")
        .replace(/\bhrs?\b/g, "hr")
        .replace(/\s+/g, "");
    case "guestCount":
      return normalized.replace(/\D/g, "");
    case "fullAddress":
      return normalized
        .replace(/\b(street|st)\b/g, "st")
        .replace(/\b(avenue|ave)\b/g, "ave")
        .replace(/\b(road|rd)\b/g, "rd")
        .replace(/\b(suite|ste|unit|apt|apartment)\b/g, "unit")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    default:
      return normalized.replace(/\s+/g, " ");
  }
}

function normalizePhoneComparable(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;
}

function normalizeTime(value: string): string {
  const match = value.match(
    /\b(\d{1,2})(?::?(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i
  );
  if (!match) return value.replace(/\s+/g, " ");

  let hour = Number(match[1]);
  const minute = match[2] ?? "00";
  const meridiem = match[3]?.replace(/\./g, "").toLowerCase();

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function buildConflictReply(conflicts: FieldConflict[]): string {
  const fieldSummary = conflicts
    .slice(0, 3)
    .map(
      conflict =>
        `${conflict.label}: ${conflict.previousValue} -> ${conflict.newValue}`
    )
    .join("; ");
  const suffix =
    conflicts.length > 3 ? `, plus ${conflicts.length - 3} more` : "";

  return `I have different details from earlier (${fieldSummary}${suffix}). Can you confirm the correct info?`;
}

function buildConflictNotes(conflicts: FieldConflict[]): string {
  return `Field conflict detected across turns: ${conflicts
    .map(
      conflict =>
        `${conflict.field} changed from "${conflict.previousValue}" to "${conflict.newValue}"`
    )
    .join("; ")}`;
}

function mergeRiskFlags(
  existing: RiskFlag[],
  incoming: RiskFlag[]
): RiskFlag[] {
  const merged = new Set<RiskFlag>();

  for (const flag of [...existing, ...incoming]) {
    if (flag !== "none") {
      merged.add(flag);
    }
  }

  return merged.size > 0 ? Array.from(merged) : ["none"];
}

function mergeNotes(existing?: string, incoming?: string): string | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return `${existing}\n${incoming}`;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
