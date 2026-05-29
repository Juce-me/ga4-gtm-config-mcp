import { describe, it, expect } from "vitest";
import { readSpec } from "../src/spec/readSpec.js";
import { toDesiredState } from "../src/planner/desiredState.js";
import { toCurrentState } from "../src/planner/currentState.js";
import { diffStates } from "../src/planner/diff.js";
import { applyPlan, type Writers } from "../src/planner/applyPlan.js";

type WriteCall = { kind: string; name: string; payload: Record<string, unknown> };

function emptyRaw() {
  return {
    ga4: { customDimensions: [], customMetrics: [], keyEvents: [] },
    gtm: { variables: [], triggers: [], tags: [], builtInVariables: [] },
  };
}

function makeContractWriters(calls: WriteCall[]): Writers {
  return {
    upsertCustomDimension: async (_unused, _propertyId, payload) => {
      calls.push({ kind: "ga4_custom_dimension", name: String(payload.parameterName), payload });
      return { action: "create", entity: payload };
    },
    upsertCustomMetric: async (_unused, _propertyId, payload) => {
      calls.push({ kind: "ga4_custom_metric", name: String(payload.parameterName), payload });
      return { action: "create", entity: payload };
    },
    upsertKeyEvent: async (_unused, _propertyId, payload) => {
      calls.push({ kind: "ga4_key_event", name: String(payload.eventName), payload });
      return { action: "create", entity: payload };
    },
    upsertVariable: async (_unused, _workspaceRef, payload) => {
      calls.push({ kind: "gtm_variable", name: String(payload.name), payload });
      return { action: "create", entity: payload };
    },
    upsertTrigger: async (_unused, _workspaceRef, payload) => {
      const idByName = new Map([
        ["CE - userevent - event", "101"],
        ["CE - userevent - pageview", "102"],
      ]);
      calls.push({ kind: "gtm_trigger", name: String(payload.name), payload });
      return { action: "create", entity: { ...payload, triggerId: idByName.get(String(payload.name)) } };
    },
    upsertTag: async (_unused, _workspaceRef, payload) => {
      calls.push({ kind: "gtm_tag", name: String(payload.name), payload });
      return { action: "create", entity: payload };
    },
    enableBuiltIn: async (_unused, _workspaceRef, name) => {
      calls.push({ kind: "gtm_built_in_variable", name: String(name), payload: { name } });
      return { action: "create", entity: { type: String(name) } };
    },
  };
}

describe("MCP execution contract", () => {
  it("non-dry-run apply sends Google API-shaped payloads to GA4 and GTM writers", async () => {
    const spec = await readSpec("tests/fixtures/specs/valid-web-dry-run.yaml");
    const desired = toDesiredState(spec);
    const currentRaw = emptyRaw();
    const current = toCurrentState(currentRaw);
    const diff = diffStates(desired, current);
    const calls: WriteCall[] = [];

    const result = await applyPlan({
      diff,
      dryRun: false,
      writers: makeContractWriters(calls),
      ga4PropertyId: "properties/000000000",
      gtmWorkspaceRef: "accounts/0000000/containers/0000000/workspaces/123",
      currentRaw,
    });

    expect(result.blocked).toBe(0);
    expect(calls.find((c) => c.kind === "ga4_custom_dimension" && c.name === "feature_name")?.payload).toMatchObject({
      parameterName: "feature_name",
      displayName: "Feature name",
      scope: "EVENT",
    });
    expect(calls.find((c) => c.kind === "ga4_custom_metric" && c.name === "time_seconds")?.payload).toMatchObject({
      parameterName: "time_seconds",
      displayName: "Result time seconds",
      scope: "EVENT",
      unit: "STANDARD",
    });
    expect(calls.find((c) => c.kind === "ga4_key_event" && c.name === "result_view")?.payload).toEqual({
      eventName: "result_view",
    });
    expect(calls.filter((c) => c.kind === "gtm_built_in_variable").map((c) => c.name).sort()).toEqual([
      "pagePath",
      "pageUrl",
      "referrer",
    ]);
    expect(calls.find((c) => c.kind === "gtm_variable" && c.name === "DLV - event_type")?.payload).toEqual({
      name: "DLV - event_type",
      type: "v",
      parameter: [
        { type: "template", key: "name", value: "event_type" },
        { type: "integer", key: "dataLayerVersion", value: "2" },
      ],
    });
    expect(calls.find((c) => c.kind === "gtm_trigger" && c.name === "CE - userevent - pageview")?.payload).toMatchObject({
      name: "CE - userevent - pageview",
      type: "customEvent",
      customEventFilter: [
        {
          type: "EQUALS",
          parameter: [
            { type: "template", key: "arg0", value: "{{_event}}" },
            { type: "template", key: "arg1", value: "userevent" },
          ],
        },
        {
          type: "EQUALS",
          parameter: [
            { type: "template", key: "arg0", value: "{{DLV - event_type}}" },
            { type: "template", key: "arg1", value: "pageview" },
          ],
        },
      ],
    });
    expect(calls.find((c) => c.kind === "gtm_tag" && c.name === "GA4 - Page View")?.payload).toMatchObject({
      name: "GA4 - Page View",
      type: "gaawe",
      firingTriggerId: ["102"],
    });
    expect(calls.find((c) => c.kind === "gtm_tag" && c.name === "GA4 - User Event")?.payload).toMatchObject({
      name: "GA4 - User Event",
      type: "gaawe",
      firingTriggerId: ["101"],
    });
  });
});
