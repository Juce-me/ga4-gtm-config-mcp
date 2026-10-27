import { describe, it, expect } from "vitest";
import { toCurrentState } from "../src/planner/currentState.js";
import { findCustomEventConditionViolations, customEventConditionCounts } from "../src/planner/triggerRules.js";

function rawWithTriggers(triggers: Record<string, unknown>[]) {
  return {
    ga4: { customDimensions: [], customMetrics: [], keyEvents: [] },
    gtm: { variables: [], triggers, tags: [], builtInVariables: [] },
  };
}

const eventCondition = (name: string) => ({
  type: "EQUALS",
  parameter: [{ key: "arg0", value: "{{_event}}" }, { key: "arg1", value: name }],
});
const extraCondition = {
  type: "EQUALS",
  parameter: [{ key: "arg0", value: "{{DLV - event_type}}" }, { key: "arg1", value: "pageview" }],
};

describe("custom event trigger condition rule", () => {
  it("accepts a live custom event trigger with only the event-name condition", () => {
    const state = toCurrentState(rawWithTriggers([
      { name: "CE - pageview", triggerId: "1", type: "customEvent", customEventFilter: [eventCondition("pageview")] },
    ]));

    expect(findCustomEventConditionViolations(state.gtm.triggers)).toEqual([]);
    expect(customEventConditionCounts(state.gtm.triggers)).toEqual([{ name: "CE - pageview", conditions: 1 }]);
  });

  it("flags a live custom event trigger with an extra condition and reports the count", () => {
    const state = toCurrentState(rawWithTriggers([
      { name: "CE - userevent", triggerId: "2", type: "customEvent", customEventFilter: [eventCondition("userevent")], filter: [extraCondition, extraCondition] },
    ]));

    expect(findCustomEventConditionViolations(state.gtm.triggers)).toEqual([
      { name: "CE - userevent", conditions: 3 },
    ]);
  });

  it("ignores non-custom-event triggers", () => {
    const state = toCurrentState(rawWithTriggers([
      { name: "PV", triggerId: "3", type: "pageview", filter: [extraCondition] },
    ]));

    expect(findCustomEventConditionViolations(state.gtm.triggers)).toEqual([]);
  });
});
