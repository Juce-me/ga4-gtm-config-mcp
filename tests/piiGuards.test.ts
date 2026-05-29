import { describe, it, expect } from "vitest";
import { findPiiViolations } from "../src/safety/piiGuards.js";

describe("piiGuards.findPiiViolations", () => {
  it("flags raw email/name/phone/ip/user_agent param keys", () => {
    expect(findPiiViolations({ params: { email: "x", phone: "x" } }).length).toBe(2);
  });

  it("flags full URL with query string as a value", () => {
    expect(findPiiViolations({ params: { ref: "https://x.com/page?q=1" } }).length).toBe(1);
  });

  it("ALLOWS the GTM built-in variable named Referrer (the name itself is not a violation)", () => {
    expect(findPiiViolations({ built_in_variables: ["Referrer"] }).length).toBe(0);
  });

  it("allows only planner-supported GTM built-in variables", () => {
    expect(findPiiViolations({
      built_in_variables: ["Page URL", "Page Path", "Page Hostname", "Referrer", "Event"],
    })).toEqual([]);
    expect(findPiiViolations({ built_in_variables: ["Page Title"] })).toMatchObject([
      { code: "SPEC_INVALID", path: "built_in_variables[0]" },
    ]);
  });

  it("flags raw 'referrer' as an event param even though the built-in is allowed", () => {
    expect(findPiiViolations({ params: { referrer: "{{Referrer}}" } }).length).toBe(1);
  });
});
