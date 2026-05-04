import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "crypto";
import { validateTwilioSignature } from "./twilio";

// Patch ENV before importing to avoid needing real credentials in tests
vi.mock("./env", () => ({
  ENV: {
    twilioAccountSid: "ACtest",
    twilioAuthToken: "test_auth_token_32chars_padding___",
    anthropicApiKey: "",
    webhookBaseUrl: "",
    cookieSecret: "test",
    databaseUrl: "",
    isProduction: false,
  },
}));

/** Compute the correct Twilio signature for a given URL + params */
function computeSignature(authToken: string, url: string, params: Record<string, string>): string {
  const sorted = Object.keys(params).sort();
  const paramString = sorted.reduce((acc, k) => acc + k + (params[k] ?? ""), "");
  return crypto.createHmac("sha1", authToken).update(url + paramString, "utf8").digest("base64");
}

const AUTH_TOKEN = "test_auth_token_32chars_padding___";
const WEBHOOK_URL = "https://example.com/api/webhook/twilio";
const SAMPLE_PARAMS = {
  From: "+15551234567",
  To: "+15559876543",
  Body: "Hello, I need a quote",
  MessageSid: "SM1234567890abcdef",
};

describe("validateTwilioSignature", () => {
  it("accepts a correctly signed request", () => {
    const sig = computeSignature(AUTH_TOKEN, WEBHOOK_URL, SAMPLE_PARAMS);
    expect(validateTwilioSignature(WEBHOOK_URL, SAMPLE_PARAMS, sig)).toBe(true);
  });

  it("rejects a tampered body (different param value)", () => {
    const goodSig = computeSignature(AUTH_TOKEN, WEBHOOK_URL, SAMPLE_PARAMS);
    const tamperedParams = { ...SAMPLE_PARAMS, Body: "Tampered message" };
    expect(validateTwilioSignature(WEBHOOK_URL, tamperedParams, goodSig)).toBe(false);
  });

  it("rejects a signature computed against a different URL", () => {
    const wrongUrl = "https://attacker.com/api/webhook/twilio";
    const sig = computeSignature(AUTH_TOKEN, wrongUrl, SAMPLE_PARAMS);
    expect(validateTwilioSignature(WEBHOOK_URL, SAMPLE_PARAMS, sig)).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(validateTwilioSignature(WEBHOOK_URL, SAMPLE_PARAMS, "")).toBe(false);
  });

  it("rejects a garbage signature", () => {
    expect(validateTwilioSignature(WEBHOOK_URL, SAMPLE_PARAMS, "not-a-valid-sig")).toBe(false);
  });

  it("sorts params alphabetically before signing (order-independent)", () => {
    // Params in reverse alphabetical order — should produce same sig
    const reversedParams: Record<string, string> = {};
    Object.keys(SAMPLE_PARAMS)
      .sort()
      .reverse()
      .forEach((k) => {
        reversedParams[k] = SAMPLE_PARAMS[k as keyof typeof SAMPLE_PARAMS];
      });
    const sig = computeSignature(AUTH_TOKEN, WEBHOOK_URL, SAMPLE_PARAMS);
    expect(validateTwilioSignature(WEBHOOK_URL, reversedParams, sig)).toBe(true);
  });

  it("handles empty params object", () => {
    const sig = computeSignature(AUTH_TOKEN, WEBHOOK_URL, {});
    expect(validateTwilioSignature(WEBHOOK_URL, {}, sig)).toBe(true);
  });
});
