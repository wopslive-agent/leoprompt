import { describe, it, expect } from "vitest";
import { transition, isNewlyQualified, isNewlyHandoff } from "./stateMachine";
import type { Conversation } from "../../drizzle/schema";

type Status = Conversation["status"];

/**
 * Table-driven tests covering V3 state transition table.
 * Format: [currentState, nextAction, shouldHandoff, shouldReject, expectedNextState]
 */
const TRANSITION_TABLE: [Status, string, boolean, boolean, Status][] = [
  // confirm_details → qualified
  ["new",                 "confirm_details",        false, false, "qualified"],
  ["faq_only",            "confirm_details",        false, false, "qualified"],
  ["collecting_details",  "confirm_details",        false, false, "qualified"],

  // handoff_to_manager → handoff_needed
  ["new",                 "handoff_to_manager",     false, false, "handoff_needed"],
  ["collecting_details",  "handoff_to_manager",     false, false, "handoff_needed"],
  ["faq_only",            "handoff_to_manager",     false, false, "handoff_needed"],

  // reject_request → rejected
  ["new",                 "reject_request",         false, false, "rejected"],
  ["collecting_details",  "reject_request",         false, false, "rejected"],

  // ask_for_missing_fields → collecting_details
  ["new",                 "ask_for_missing_fields", false, false, "collecting_details"],
  ["faq_only",            "ask_for_missing_fields", false, false, "collecting_details"],
  ["collecting_details",  "ask_for_missing_fields", false, false, "collecting_details"],

  // answer_faq: new/faq_only → faq_only; collecting_details stays
  ["new",                 "answer_faq",             false, false, "faq_only"],
  ["faq_only",            "answer_faq",             false, false, "faq_only"],
  ["collecting_details",  "answer_faq",             false, false, "collecting_details"],

  // wait_for_user / no_reply → unchanged
  ["new",                 "wait_for_user",          false, false, "new"],
  ["collecting_details",  "wait_for_user",          false, false, "collecting_details"],
  ["new",                 "no_reply",               false, false, "new"],

  // shouldReject override takes priority
  ["new",                 "answer_faq",             false, true,  "rejected"],
  ["collecting_details",  "answer_faq",             false, true,  "rejected"],

  // shouldHandoff override takes priority (but not over shouldReject)
  ["new",                 "answer_faq",             true,  false, "handoff_needed"],
  ["collecting_details",  "answer_faq",             true,  false, "handoff_needed"],

  // Locked states are never changed
  ["qualified",           "confirm_details",        false, false, "qualified"],
  ["qualified",           "ask_for_missing_fields", false, false, "qualified"],
  ["qualified",           "handoff_to_manager",     true,  false, "qualified"],
  ["rejected",            "confirm_details",        false, false, "rejected"],
  ["closed",              "confirm_details",        false, false, "closed"],
  ["awaiting_manager",    "confirm_details",        false, false, "awaiting_manager"],
];

describe("stateMachine.transition", () => {
  it.each(TRANSITION_TABLE)(
    "%s + action=%s shouldHandoff=%s shouldReject=%s → %s",
    (current, nextAction, shouldHandoff, shouldReject, expected) => {
      const result = transition(current, {
        nextAction: nextAction as any,
        shouldHandoff,
        shouldReject,
      });
      expect(result).toBe(expected);
    }
  );
});

describe("stateMachine.isNewlyQualified", () => {
  it("returns true when transitioning into qualified for the first time", () => {
    expect(isNewlyQualified("collecting_details", "qualified")).toBe(true);
    expect(isNewlyQualified("new", "qualified")).toBe(true);
  });

  it("returns false when already qualified", () => {
    expect(isNewlyQualified("qualified", "qualified")).toBe(false);
  });

  it("returns false for transitions that don't land in qualified", () => {
    expect(isNewlyQualified("new", "collecting_details")).toBe(false);
    expect(isNewlyQualified("collecting_details", "handoff_needed")).toBe(false);
  });
});

describe("stateMachine.isNewlyHandoff", () => {
  it("returns true when transitioning into handoff_needed for the first time", () => {
    expect(isNewlyHandoff("new", "handoff_needed")).toBe(true);
    expect(isNewlyHandoff("collecting_details", "handoff_needed")).toBe(true);
  });

  it("returns false when already in handoff_needed", () => {
    expect(isNewlyHandoff("handoff_needed", "handoff_needed")).toBe(false);
  });

  it("returns false for other transitions", () => {
    expect(isNewlyHandoff("new", "collecting_details")).toBe(false);
    expect(isNewlyHandoff("new", "qualified")).toBe(false);
  });
});
