import { describe, it, expect } from "vitest";
import {
  desiredBuiltInVariableToGtmType,
  desiredCustomMetricToGa4Payload,
  desiredVariableToGtmPayload,
  desiredTriggerToGtmPayload,
  desiredTagToGtmPayload,
} from "../src/planner/apiPayloads.js";

describe("desired→GTM payload shapes", () => {
  it("custom metric: maps internal unit to GA Admin measurementUnit", () => {
    const payload = desiredCustomMetricToGa4Payload({
      parameter_name: "time_seconds",
      display_name: "Swim time seconds",
      scope: "EVENT",
      unit: "SECONDS",
      description: "Swim result time in seconds.",
    });

    expect(payload).toEqual({
      parameterName: "time_seconds",
      displayName: "Swim time seconds",
      scope: "EVENT",
      measurementUnit: "SECONDS",
      description: "Swim result time in seconds.",
    });
    expect("unit" in payload).toBe(false);
  });

  it("built-in variable: maps planner display names to GTM API type values", () => {
    expect(desiredBuiltInVariableToGtmType("Page URL")).toBe("pageUrl");
    expect(desiredBuiltInVariableToGtmType("Page Path")).toBe("pagePath");
    expect(desiredBuiltInVariableToGtmType("Referrer")).toBe("referrer");
  });

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

  it("trigger: separates custom event name from additional trigger filters", () => {
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
    expect(payload.customEventFilter).toEqual([
      {
        type: "EQUALS",
        parameter: [
          { type: "template", key: "arg0", value: "{{_event}}" },
          { type: "template", key: "arg1", value: "userevent" },
        ],
      },
    ]);
    expect(payload.filter).toEqual([
      {
        type: "EQUALS",
        parameter: [
          { type: "template", key: "arg0", value: "{{DLV - event_type}}" },
          { type: "template", key: "arg1", value: "pageview" },
        ],
      },
    ]);
    expect(payload.customEventFilter[0]!.type).toBe("EQUALS");
  });

  it("tag: GA4 - Page View body has eventName + measurementId + extra params and trigger ID", () => {
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
    }, new Map([["CE - userevent - pageview", "17"]]));
    expect(payload.name).toBe("GA4 - Page View");
    expect(payload.type).toBe("gaawe");
    expect(payload.firingTriggerId).toEqual(["17"]);
    const keys = payload.parameter.map((p) => p.key);
    expect(keys).toEqual(["eventName", "measurementId", "eventParameters"]);
    expect(payload.parameter[2]).toEqual({
      type: "list",
      key: "eventParameters",
      list: [
        {
          type: "map",
          map: [
            { type: "template", key: "name", value: "page_name" },
            { type: "template", key: "value", value: "{{DLV - userParams.page_name}}" },
          ],
        },
      ],
    });
  });
});
