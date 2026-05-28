import { describe, it, expect } from "vitest";
import { gateConsentChange } from "../src/safety/consentGuards.js";

describe("consentGuards.gateConsentChange", () => {
  it("blocks when a consent tag appears and guard is not explicitly approved", () => {
    const spec = {
      gtm_web: { tags: [{ type: "consent_initialization", name: "Consent Init" }] },
      validation: { consent_change_guard: { modify_consent_settings: false } },
    } as any;
    const r = gateConsentChange(spec);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("CONSENT_CHANGE_BLOCKED");
  });

  it("passes when no consent tags are present", () => {
    const spec = { gtm_web: { tags: [{ type: "ga4_event", name: "GA4 - Page View" }] } } as any;
    expect(gateConsentChange(spec).ok).toBe(true);
  });

  it("passes when consent change is explicitly approved", () => {
    const spec = {
      gtm_web: { tags: [{ type: "consent_settings", name: "Consent" }] },
      validation: { consent_change_guard: { modify_consent_settings: true } },
    } as any;
    expect(gateConsentChange(spec).ok).toBe(true);
  });
});
