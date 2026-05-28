import { describe, it, expect } from "vitest";
import { toCurrentState } from "../src/planner/currentState.js";

describe("toCurrentState", () => {
  it("normalizes a mocked GA4 + GTM response into the same shape as desiredState", () => {
    const raw = {
      ga4: {
        customDimensions: [{ name: "properties/1/customDimensions/2", parameterName: "feature_name", displayName: "Feature name", scope: "EVENT", description: "x" }],
        customMetrics: [{ name: "properties/1/customMetrics/3", parameterName: "time_seconds", displayName: "Result time seconds", scope: "EVENT", unit: "SECONDS" }],
        keyEvents: [{ name: "properties/1/keyEvents/4", eventName: "result_view" }],
      },
      gtm: {
        builtInVariables: [{ name: "Page URL" }, { name: "Referrer" }],
        variables: [{
          name: "DLV - event_type",
          parameter: [
            { type: "template", key: "name", value: "event_type" },
            { type: "integer", key: "dataLayerVersion", value: "2" },
          ],
        }],
        triggers: [{ name: "CE - userevent - pageview", type: "customEvent", customEventFilter: [{ type: "EQUALS", parameter: [{ key: "arg0", value: "{{DLV - event_type}}" }, { key: "arg1", value: "pageview" }] }] }],
        tags: [{ name: "GA4 - Page View", type: "ga4_event", parameter: [{ key: "eventName", value: "page_view" }, { key: "measurementId", value: "G-XXXXXXX000" }] }],
      },
    };
    const c = toCurrentState(raw);
    expect(c.ga4.customDimensions[0]!.name).toBe("feature_name");
    expect(c.ga4.customMetrics[0]!.config.unit).toBe("SECONDS");
    expect(c.gtm.builtInVariables.map((b) => b.name).sort()).toEqual(["Page URL", "Referrer"]);
    expect(c.gtm.variables[0]!.config.dlvName).toBe("event_type");
  });

  it("never returns a secretValue field anywhere", () => {
    const raw = {
      ga4: { customDimensions: [], customMetrics: [], keyEvents: [] },
      gtm: { builtInVariables: [], variables: [], triggers: [], tags: [] },
    };
    const c = toCurrentState(raw);
    const serialized = JSON.stringify(c);
    expect(serialized.includes("secretValue")).toBe(false);
  });
});
