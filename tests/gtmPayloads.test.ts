import { describe, it, expect } from "vitest";
import {
  desiredVariableToGtmPayload,
  desiredTriggerToGtmPayload,
  desiredTagToGtmPayload,
} from "../src/planner/desiredState.js";

describe("desired→GTM payload shapes", () => {
  it("variable: produces the v-type DLV body", () => {
    const payload = desiredVariableToGtmPayload({
      kind: "gtm_variable",
      name: "DLV - event_type",
      config: { variableType: "dlv", dlvName: "event_type", dlvVersion: 2 },
    });
    expect(payload).toEqual({
      name: "DLV - event_type",
      type: "v",
      parameter: [
        { type: "template", key: "name", value: "event_type" },
        { type: "integer", key: "dataLayerVersion", value: "2" },
      ],
    });
  });

  it("trigger: maps snake_case to camelCase and produces customEventFilter", () => {
    const payload = desiredTriggerToGtmPayload({
      kind: "gtm_trigger",
      name: "CE - userevent - pageview",
      config: {
        triggerType: "custom_event",
        eventName: "userevent",
        filters: [{ variable: "DLV - event_type", operator: "equals", value: "pageview" }],
      },
    });
    expect(payload.type).toBe("customEvent");
    expect(payload.customEventFilter.length).toBe(1);
    expect(payload.customEventFilter[0]!.type).toBe("EQUALS");
  });

  it("tag: GA4 - Page View body has eventName + measurementId + extra params", () => {
    const payload = desiredTagToGtmPayload({
      kind: "gtm_tag",
      name: "GA4 - Page View",
      config: {
        tagType: "ga4_event",
        measurementId: "G-XXXXXXX000",
        eventName: "page_view",
        trigger: "CE - userevent - pageview",
        params: { page_name: "{{DLV - userParams.page_name}}" },
      },
    });
    expect(payload.name).toBe("GA4 - Page View");
    expect(payload.type).toBe("ga4_event");
    const keys = payload.parameter.map((p) => p.key);
    expect(keys).toEqual(["eventName", "measurementId", "page_name"]);
  });
});
