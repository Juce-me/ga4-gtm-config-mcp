import { describe, it, expect } from "vitest";
import { applyPlan, type Writers } from "../src/planner/applyPlan.js";
import type { Diff } from "../src/planner/diff.js";

const baseDiff: Diff = {
  creates: [
    { kind: "ga4_custom_dimension", name: "feature_name", status: "create", after: { parameter_name: "feature_name", display_name: "Feature name", scope: "EVENT" } },
    { kind: "gtm_variable", name: "DLV - event_type", status: "create", after: { variableType: "dlv", dlvName: "event_type", dlvVersion: 2 } },
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

  it("uses existing currentRaw trigger IDs for tag firingTriggerId", async () => {
    let tagPayload: Record<string, unknown> | undefined;
    const w = makeWriters();
    w.upsertTag = async (_unused, _workspaceRef, payload) => {
      w.calls.push("gtmtg");
      tagPayload = payload;
      return { action: "create", entity: {} };
    };
    const d: Diff = {
      ...baseDiff,
      creates: [{
        kind: "gtm_tag",
        name: "GA4 - Page View",
        status: "create",
        after: {
          tagType: "ga4_event",
          measurementId: "G-XXXXXXX000",
          eventName: "page_view",
          trigger: "CE - userevent - pageview",
          params: {},
        },
      }],
    };
    const raw = emptyRaw();
    raw.gtm.triggers.push({ name: "CE - userevent - pageview", triggerId: "22" });

    const r = await applyPlan({ diff: d, dryRun: false, writers: w, ga4PropertyId: "properties/1", gtmWorkspaceRef: "accounts/1/containers/2/workspaces/3", currentRaw: raw });

    expect(r.applied).toBe(1);
    expect(tagPayload?.firingTriggerId).toEqual(["22"]);
  });

  it("blocks tags with unresolved trigger names before calling the tag writer", async () => {
    const w = makeWriters();
    const d: Diff = {
      ...baseDiff,
      creates: [{
        kind: "gtm_tag",
        name: "GA4 - Page View",
        status: "create",
        after: {
          tagType: "ga4_event",
          measurementId: "G-XXXXXXX000",
          eventName: "page_view",
          trigger: "Missing Trigger",
          params: {},
        },
      }],
    };
    const r = await applyPlan({ diff: d, dryRun: false, writers: w, ga4PropertyId: "properties/1", gtmWorkspaceRef: "accounts/1/containers/2/workspaces/3", currentRaw: emptyRaw() });

    expect(r.applied).toBe(0);
    expect(r.blocked).toBe(1);
    expect(r.callsMade).toBe(0);
    expect(w.calls).toEqual([]);
    expect(r.details[0]?.reason).toContain('unresolved trigger "Missing Trigger"');
  });

  it("creates triggers before tags even when tag names sort first", async () => {
    let tagPayload: Record<string, unknown> | undefined;
    const w = makeWriters();
    w.upsertTrigger = async () => {
      w.calls.push("gtmt");
      return { action: "create", entity: { triggerId: "31" } };
    };
    w.upsertTag = async (_unused, _workspaceRef, payload) => {
      w.calls.push("gtmtg");
      tagPayload = payload;
      return { action: "create", entity: payload };
    };
    const d: Diff = {
      ...baseDiff,
      creates: [
        {
          kind: "gtm_tag",
          name: "A - GA4 Event",
          status: "create",
          after: {
            tagType: "ga4_event",
            measurementId: "G-XXXXXXX000",
            eventName: "{{DLV - event_name}}",
            trigger: "Z - CE Event",
            params: {},
          },
        },
        {
          kind: "gtm_trigger",
          name: "Z - CE Event",
          status: "create",
          after: {
            triggerType: "custom_event",
            eventName: "userevent",
            filters: [],
          },
        },
      ],
    };

    const r = await applyPlan({ diff: d, dryRun: false, writers: w, ga4PropertyId: "properties/1", gtmWorkspaceRef: "accounts/1/containers/2/workspaces/3", currentRaw: emptyRaw() });

    expect(r.blocked).toBe(0);
    expect(r.applied).toBe(2);
    expect(w.calls).toEqual(["gtmt", "gtmtg"]);
    expect(tagPayload?.firingTriggerId).toEqual(["31"]);
  });

  it("counts a writer invocation even if the writer throws", async () => {
    const w = makeWriters();
    w.upsertVariable = async () => {
      w.calls.push("gtmv");
      throw new Error("api failed after request");
    };

    const r = await applyPlan({ diff: { ...baseDiff, creates: [baseDiff.creates[1]!] }, dryRun: false, writers: w, ga4PropertyId: "properties/1", gtmWorkspaceRef: "accounts/1/containers/2/workspaces/3", currentRaw: emptyRaw() });

    expect(r.applied).toBe(0);
    expect(r.blocked).toBe(1);
    expect(r.callsMade).toBe(1);
    expect(w.calls).toEqual(["gtmv"]);
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
