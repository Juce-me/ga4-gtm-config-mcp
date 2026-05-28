import { describe, it, expect } from "vitest";
import { findDestructiveChanges } from "../src/safety/destructiveChangeGuards.js";

describe("destructiveChangeGuards.findDestructiveChanges", () => {
  const specAllowed = { execution: { destructive_changes_allowed: true } } as any;
  const specBlocked = { execution: { destructive_changes_allowed: false } } as any;

  it("flags a delete operation when destructive changes are not allowed", () => {
    const diff = { deletes: [{ kind: "tag", name: "Old Tag" }], updates: [], creates: [], archives: [] };
    const r = findDestructiveChanges(diff, specBlocked);
    expect(r.length).toBe(1);
    expect(r[0]!.code).toBe("SPEC_INVALID");
  });

  it("allows the same delete when explicitly approved", () => {
    const diff = { deletes: [{ kind: "tag", name: "Old Tag" }], updates: [], creates: [], archives: [] };
    expect(findDestructiveChanges(diff, specAllowed)).toEqual([]);
  });

  it("flags a GA4 custom-definition archive regardless of the flag", () => {
    const diff = { deletes: [], updates: [], creates: [], archives: [{ kind: "ga4_custom_dimension", name: "feature_name" }] };
    // Archives are NEVER auto-approved — the project's safety brief says archive is not supported.
    expect(findDestructiveChanges(diff, specAllowed).length).toBe(1);
  });
});
