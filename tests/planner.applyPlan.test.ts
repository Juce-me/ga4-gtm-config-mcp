import { describe, it, expect } from "vitest";
import { applyPlan, type Writers } from "../src/planner/applyPlan.js";
import type { Diff } from "../src/planner/diff.js";

const baseDiff: Diff = {
  creates: [
    { kind: "ga4_custom_dimension", name: "feature_name", status: "create", after: { parameterName: "feature_name", displayName: "Feature name", scope: "EVENT" } },
    { kind: "gtm_variable", name: "DLV - event_type", status: "create", after: { name: "DLV - event_type", type: "v", parameter: [] } },
  ],
  updates: [],
  unchanged: [],
  skipped: [],
  blocked: [],
  warnings: [],
};

function makeWriters(): Writers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    upsertCustomDimension: async () => { calls.push("ga4cd"); return { action: "create", entity: {} }; },
    upsertCustomMetric:    async () => { calls.push("ga4cm"); return { action: "create", entity: {} }; },
    upsertKeyEvent:        async () => { calls.push("ga4ke"); return { action: "create", entity: {} }; },
    upsertVariable:        async () => { calls.push("gtmv");  return { action: "create", entity: {} }; },
    upsertTrigger:         async () => { calls.push("gtmt");  return { action: "create", entity: {} }; },
    upsertTag:             async () => { calls.push("gtmtg"); return { action: "create", entity: {} }; },
    enableBuiltIn:         async () => { calls.push("gtmbiv"); return { action: "create", entity: { type: "" } }; },
  };
}

describe("applyPlan", () => {
  it("dry_run=true never calls any writer, skips everything that would write", async () => {
    const w = makeWriters();
    const r = await applyPlan({ diff: baseDiff, dryRun: true, writers: w, ga4PropertyId: "properties/1", gtmWorkspaceRef: "accounts/1/containers/2/workspaces/3", currentRaw: emptyRaw() });
    expect(r.applied).toBe(0);
    expect(r.skipped).toBe(2);
    expect(r.blocked).toBe(0);
    expect(r.callsMade).toBe(0);
    expect(w.calls).toEqual([]);
  });

  it("dry_run=false invokes the matching writer per entity", async () => {
    const w = makeWriters();
    const r = await applyPlan({ diff: baseDiff, dryRun: false, writers: w, ga4PropertyId: "properties/1", gtmWorkspaceRef: "accounts/1/containers/2/workspaces/3", currentRaw: emptyRaw() });
    expect(r.applied).toBe(2);
    expect(r.skipped).toBe(0);
    expect(w.calls.sort()).toEqual(["ga4cd", "gtmv"]);
  });

  it("treats unknown kinds as blocked, not crashed", async () => {
    const w = makeWriters();
    const bogus: Diff = { ...baseDiff, creates: [{ kind: "totally_made_up", name: "x", status: "create", after: {} }] };
    const r = await applyPlan({ diff: bogus, dryRun: false, writers: w, ga4PropertyId: "properties/1", gtmWorkspaceRef: "accounts/1/containers/2/workspaces/3", currentRaw: emptyRaw() });
    expect(r.blocked).toBe(1);
    expect(r.applied).toBe(0);
    expect(w.calls).toEqual([]);
  });

  it("counts unchanged toward neither applied nor skipped (it's already correct)", async () => {
    const w = makeWriters();
    const d: Diff = { ...baseDiff, creates: [], unchanged: [{ kind: "ga4_custom_dimension", name: "f", status: "unchanged" }] };
    const r = await applyPlan({ diff: d, dryRun: false, writers: w, ga4PropertyId: "properties/1", gtmWorkspaceRef: "accounts/1/containers/2/workspaces/3", currentRaw: emptyRaw() });
    expect(r.applied).toBe(0);
    expect(r.skipped).toBe(0);
    expect(r.unchanged).toBe(1);
  });

  it("returns a deterministic summary object (same input → same output shape)", async () => {
    const w = makeWriters();
    const r1 = await applyPlan({ diff: baseDiff, dryRun: true, writers: w, ga4PropertyId: "properties/1", gtmWorkspaceRef: "accounts/1/containers/2/workspaces/3", currentRaw: emptyRaw() });
    const w2 = makeWriters();
    const r2 = await applyPlan({ diff: baseDiff, dryRun: true, writers: w2, ga4PropertyId: "properties/1", gtmWorkspaceRef: "accounts/1/containers/2/workspaces/3", currentRaw: emptyRaw() });
    // Compare summary minus per-entity timestamps (the summary shouldn't carry any)
    expect(Object.keys(r1).sort()).toEqual(Object.keys(r2).sort());
  });
});

function emptyRaw() {
  return {
    ga4: { customDimensions: [], customMetrics: [], keyEvents: [] },
    gtm: { variables: [], triggers: [], tags: [], builtInVariables: [] },
  };
}
