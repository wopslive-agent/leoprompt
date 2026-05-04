import { describe, expect, it } from "vitest";
import { extractChannel, normalizePhone } from "../twilio";

describe("twilio channel helpers", () => {
  describe("extractChannel", () => {
    it("detects whatsapp prefix", () => {
      expect(extractChannel("whatsapp:+14165550100")).toBe("whatsapp");
    });

    it("defaults to sms for plain E.164 numbers", () => {
      expect(extractChannel("+14165550100")).toBe("sms");
    });

    it("defaults to sms for numeric-only strings", () => {
      expect(extractChannel("4165550100")).toBe("sms");
    });
  });

  describe("normalizePhone", () => {
    it("strips the whatsapp: prefix", () => {
      expect(normalizePhone("whatsapp:+14165550100")).toBe("+14165550100");
    });

    it("leaves plain E.164 numbers unchanged", () => {
      expect(normalizePhone("+14165550100")).toBe("+14165550100");
    });

    it("leaves numeric-only strings unchanged", () => {
      expect(normalizePhone("4165550100")).toBe("4165550100");
    });
  });
});
