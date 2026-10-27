import type { NormalizedGtm } from "./desiredState.js";

export interface CustomEventConditionCount {
  name: string;
  conditions: number;
}

// A custom_event trigger must match on the event name alone. Extra conditions
// (e.g. on DLV variables) stopped GA4 collect requests from firing in production.
export function customEventConditionCounts(triggers: NormalizedGtm["triggers"]): CustomEventConditionCount[] {
  return triggers
    .filter((t) => t.config.triggerType === "custom_event")
    .map((t) => ({
      name: t.name,
      conditions: (t.config.eventName !== undefined ? 1 : 0) + t.config.filters.length,
    }));
}

export function findCustomEventConditionViolations(triggers: NormalizedGtm["triggers"]): CustomEventConditionCount[] {
  return customEventConditionCounts(triggers).filter((c) => c.conditions > 1);
}
