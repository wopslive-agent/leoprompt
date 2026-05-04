import type { Conversation } from "../../drizzle/schema";
import type { IntakeResult, NextAction } from "./ai";

type ConversationStatus = Conversation["status"];

// States where operator intervention is required before bot can proceed
const LOCKED = new Set<ConversationStatus>([
  "qualified", "rejected", "closed", "awaiting_manager",
]);

/**
 * Pure transition function — no side effects, no DB access.
 * Given the current state + AI output, return the next state.
 *
 * V3 state table:
 * ┌──────────────────────┬───────────────────────┬──────────────────────┐
 * │ Current              │ Signal                │ Next                 │
 * ├──────────────────────┼───────────────────────┼──────────────────────┤
 * │ any locked           │ any                   │ (unchanged)          │
 * │ any                  │ shouldReject=true      │ rejected             │
 * │ any                  │ shouldHandoff=true     │ handoff_needed       │
 * │ any                  │ confirm_details        │ qualified            │
 * │ any                  │ handoff_to_manager     │ handoff_needed       │
 * │ any                  │ reject_request         │ rejected             │
 * │ any                  │ ask_for_missing_fields │ collecting_details   │
 * │ new | faq_only       │ answer_faq             │ faq_only             │
 * │ other                │ answer_faq             │ (unchanged)          │
 * │ any                  │ wait_for_user / no_reply│ (unchanged)         │
 * └──────────────────────┴───────────────────────┴──────────────────────┘
 */
export function transition(
  current: ConversationStatus,
  result: Pick<IntakeResult, "nextAction" | "shouldHandoff" | "shouldReject">
): ConversationStatus {
  if (LOCKED.has(current)) return current;

  // Boolean overrides take priority — deterministic safety rails
  if (result.shouldReject) return "rejected";
  if (result.shouldHandoff) return "handoff_needed";

  switch (result.nextAction) {
    case "confirm_details":
      return "qualified";
    case "handoff_to_manager":
      return "handoff_needed";
    case "reject_request":
      return "rejected";
    case "ask_for_missing_fields":
      return "collecting_details";
    case "answer_faq":
      return current === "new" || current === "faq_only" ? "faq_only" : current;
    case "wait_for_user":
    case "no_reply":
    default:
      return current;
  }
}

/** True when this turn moves the conversation into qualified for the first time. */
export function isNewlyQualified(
  prev: ConversationStatus,
  next: ConversationStatus
): boolean {
  return next === "qualified" && prev !== "qualified";
}

/** True when this turn triggers a handoff for the first time. */
export function isNewlyHandoff(
  prev: ConversationStatus,
  next: ConversationStatus
): boolean {
  return next === "handoff_needed" && prev !== "handoff_needed";
}

/** True when this turn routes to human review for the first time. */
export function isNewlyHumanReview(
  prev: ConversationStatus,
  next: ConversationStatus
): boolean {
  return next === "human_review" && prev !== "human_review";
}
