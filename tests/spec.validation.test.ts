import { describe, it, expect } from "vitest";
import { readSpec } from "../src/spec/readSpec.js";
import { validateSpec } from "../src/spec/validateSpec.js";

const cases: Array<[string, string]> = [
  ["invalid-ua-fields.yaml", "SPEC_INVALID"],
  ["invalid-secret-in-spec.yaml", "SECRET_DETECTED"],
  ["invalid-high-card-cd.yaml", "PII_DETECTED"],
  ["invalid-per-event-tag.yaml", "SPEC_INVALID"],
  ["invalid-consent-change.yaml", "CONSENT_CHANGE_BLOCKED"],
];

describe("validateSpec", () => {
  it("passes the valid fixture", async () => {
    const spec = await readSpec("tests/fixtures/specs/valid-web-dry-run.yaml");
    const r = validateSpec(spec);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  for (const [file, code] of cases) {
    it(`rejects ${file} with ${code}`, async () => {
      const spec = await readSpec(`tests/fixtures/specs/${file}`).catch((e) => e);
      // For SPEC_INVALID at schema level, readSpec throws. For semantic violations,
      // readSpec succeeds and validateSpec returns the error.
      if (spec instanceof Error) {
        expect((spec as { code?: string }).code).toBe(code);
      } else {
        const r = validateSpec(spec);
        expect(r.ok).toBe(false);
        expect(r.errors.map((e) => e.code)).toContain(code);
      }
    });
  }
});
