import { describe, it, expect, vi } from "vitest";

vi.mock("./env", () => ({
  ENV: {
    textlinksmsApiKey: "",
    textlinksmsApiBase: "https://textlinksms.com",
    textlinksmsWebhookSecret: "super_secret_value_for_testing_only_32",
    textlinksmsSimCardId: undefined,
    twilioAccountSid: "",
    twilioAuthToken: "",
    anthropicApiKey: "",
    webhookBaseUrl: "",
    cookieSecret: "test",
    databaseUrl: "",
    isProduction: false,
  },
}));

import { verifyWebhookSecret } from "./textlinksms";

const VALID = "super_secret_value_for_testing_only_32";

describe("verifyWebhookSecret", () => {
  it("accepts a matching secret", () => {
    expect(verifyWebhookSecret(VALID)).toBe(true);
  });

  it("rejects a mismatched secret", () => {
    expect(verifyWebhookSecret("not_the_right_secret")).toBe(false);
  });

  it("rejects an empty provided secret", () => {
    expect(verifyWebhookSecret("")).toBe(false);
  });

  it("rejects when lengths differ even by one byte", () => {
    expect(verifyWebhookSecret(VALID + "x")).toBe(false);
  });
});
