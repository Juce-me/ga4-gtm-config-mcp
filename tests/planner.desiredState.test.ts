import { describe, it, expect } from "vitest";
import { readSpec } from "../src/spec/readSpec.js";
import { toDesiredState } from "../src/planner/desiredState.js";

describe("toDesiredState", () => {
  it("normalizes the valid fixture into stable sorted arrays", async () => {
    const spec = await readSpec("tests/fixtures/specs/valid-web-dry-run.yaml");
    const d = toDesiredState(spec);

    // GA4
    expect(d.ga4.customDimensions.length).toBe(1);
    expect(d.ga4.customDimensions[0]!.name).toBe("feature_name");
    expect(d.ga4.customMetrics[0]!.config.unit).toBe("STANDARD"); // fixture uses STANDARD
    expect(d.ga4.keyEvents.length).toBe(1);

    // GTM
    expect(d.gtm.builtInVariables.map((v) => v.name)).toEqual(["Page Path", "Page URL", "Referrer"]);
    expect(d.gtm.variables.length).toBeGreaterThanOrEqual(4);
    expect(d.gtm.triggers.length).toBe(2);
    expect(d.gtm.tags.length).toBe(2);

    // Sort stability
    for (const arr of [d.ga4.customDimensions, d.ga4.customMetrics, d.gtm.variables, d.gtm.triggers, d.gtm.tags]) {
      const names = arr.map((e) => e.name);
      expect(names).toEqual([...names].sort());
    }
  });

  it("two runs produce structurally equal output", async () => {
    const spec = await readSpec("tests/fixtures/specs/valid-web-dry-run.yaml");
    expect(toDesiredState(spec)).toEqual(toDesiredState(spec));
  });
});
