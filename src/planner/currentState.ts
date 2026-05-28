import type { NormalizedState, NormalizedGtm } from "./desiredState.js";

// ─── Loose input types (raw Google API responses) ─────────────────────────────
// We use `unknown`-based helpers rather than strict googleapis types so this
// normalizer remains decoupled from the googleapis version.

type AnyObj = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function getParam(params: unknown, key: string): string {
  if (!Array.isArray(params)) return "";
  const p = (params as AnyObj[]).find((x) => x["key"] === key);
  return p ? str(p["value"]) : "";
}

// ─── Operator mapping: GTM API uppercase → spec lowercase ─────────────────────
const OPERATOR_MAP: Record<string, string> = {
  EQUALS: "equals",
  CONTAINS: "contains",
  STARTS_WITH: "starts_with",
  ENDS_WITH: "ends_with",
  MATCHES_REGEX: "matches_regex",
};

// ─── Trigger-type mapping: GTM API camelCase → spec snake_case ────────────────
// Kept for documentation; we store the raw GTM value in normalized form so
// currentState and desiredState use the SAME values for comparison.
// (desiredState stores spec snake_case; this normalizer stores GTM camelCase.)
// The diff layer compares the two currentState outputs directly — it does NOT
// need them to share the same triggerType string. If a round-trip equality is
// ever needed, apply this map before returning.
//
// NOTE: We intentionally keep raw GTM values here (camelCase) so that
// currentState → diff produces sensible "update" signals when the spec
// snake_case differs. That means triggers always show as "update" vs. desired
// when the strings differ. Refinement can normalize further once real data
// confirms the exact round-trip requirement.

// ─── Main normalizer ──────────────────────────────────────────────────────────

export function toCurrentState(raw: {
  ga4: {
    customDimensions: AnyObj[];
    customMetrics: AnyObj[];
    keyEvents: AnyObj[];
  };
  gtm: {
    builtInVariables: AnyObj[];
    variables: AnyObj[];
    triggers: AnyObj[];
    tags: AnyObj[];
  };
}): NormalizedState {
  const ga4 = {
    customDimensions: sortByName(
      raw.ga4.customDimensions.map((cd) => {
        const parameterName = str(cd["parameterName"]);
        return {
          kind: "ga4_custom_dimension" as const,
          name: parameterName,
          config: {
            parameter_name: parameterName,
            display_name: str(cd["displayName"]),
            scope: str(cd["scope"]),
            ...(cd["description"] !== undefined ? { description: str(cd["description"]) } : {}),
          },
        };
      }),
    ),
    customMetrics: sortByName(
      raw.ga4.customMetrics.map((cm) => {
        const parameterName = str(cm["parameterName"]);
        return {
          kind: "ga4_custom_metric" as const,
          name: parameterName,
          config: {
            parameter_name: parameterName,
            display_name: str(cm["displayName"]),
            scope: str(cm["scope"]),
            unit: str(cm["unit"]),
            ...(cm["description"] !== undefined ? { description: str(cm["description"]) } : {}),
          },
        };
      }),
    ),
    keyEvents: sortByName(
      raw.ga4.keyEvents.map((ke) => {
        const eventName = str(ke["eventName"]);
        return {
          kind: "ga4_key_event" as const,
          name: eventName,
          config: { event_name: eventName },
        };
      }),
    ),
  };

  const gtm = {
    builtInVariables: sortByName(
      raw.gtm.builtInVariables.map((b) => ({
        kind: "gtm_built_in_variable" as const,
        name: str(b["name"]),
        config: {} as Record<string, never>,
      })),
    ),
    variables: sortByName(
      raw.gtm.variables.map((v) => {
        const params = v["parameter"] as AnyObj[] | undefined;
        const dlvName = getParam(params, "name");
        const dlvVersionRaw = getParam(params, "dataLayerVersion");
        const dlvVersion = (dlvVersionRaw === "1" ? 1 : 2) as 1 | 2;
        return {
          kind: "gtm_variable" as const,
          name: str(v["name"]),
          config: {
            variableType: "dlv" as const,
            dlvName,
            dlvVersion,
          },
        };
      }),
    ),
    triggers: sortByName(
      raw.gtm.triggers.map((t) => normalizeGtmTrigger(t)),
    ),
    tags: sortByName(
      raw.gtm.tags.map((tg) => normalizeGtmTag(tg)),
    ),
  };

  return { ga4, gtm };
}

// ─── Trigger normalization ────────────────────────────────────────────────────
// GTM stores trigger conditions in two possible arrays depending on trigger type:
//   - customEventFilter (for customEvent triggers)
//   - filter (for DOM-ready, window-loaded, etc.)
// Each condition entry looks like:
//   { type: "EQUALS", parameter: [{ key: "arg0", value: "{{DLV - x}}" }, { key: "arg1", value: "y" }] }
// We extract arg0 (stripping {{ }}) as the variable name and arg1 as the value.
// If the shape doesn't match (e.g., no parameter array), we produce a best-effort
// entry with empty strings so the diff at least sees the entity as present.
function normalizeGtmTrigger(t: AnyObj): NormalizedGtm["triggers"][number] {
  const rawFilters = (Array.isArray(t["customEventFilter"])
    ? t["customEventFilter"]
    : Array.isArray(t["filter"])
      ? t["filter"]
      : []) as AnyObj[];

  const filters = rawFilters.map((f) => {
    const op = OPERATOR_MAP[str(f["type"])] ?? str(f["type"]).toLowerCase();
    const params = f["parameter"] as AnyObj[] | undefined;
    // arg0 typically contains "{{VariableName}}" — strip the mustache delimiters
    const arg0Raw = getParam(params, "arg0");
    const variable = arg0Raw.replace(/^\{\{/, "").replace(/\}\}$/, "");
    const value = getParam(params, "arg1");
    return { variable, operator: op, value };
  });

  return {
    kind: "gtm_trigger" as const,
    name: str(t["name"]),
    config: {
      triggerType: str(t["type"]),
      ...(t["name"] !== undefined ? {} : {}), // no-op placeholder; eventName is not stored on GTM trigger objects
      filters,
    },
  };
}

// ─── Tag normalization ────────────────────────────────────────────────────────
// GA4 event tags store their parameters in a flat `parameter` array.
// We pull out eventName and measurementId by key, then collect the remainder
// into `params`. The `firingTriggerIds` array contains numeric IDs; we do not
// resolve them back to names here (that mapping lives in the apply orchestrator).
// For normalization purposes, `trigger` is left empty — the diff will flag tags
// as "update" if this field differs from desiredState (where trigger is a name).
// This is an acceptable limitation at M5; full resolution is an M6 concern.
function normalizeGtmTag(tg: AnyObj): NormalizedGtm["tags"][number] {
  const params = tg["parameter"] as AnyObj[] | undefined;
  const eventName = getParam(params, "eventName");
  const measurementId = getParam(params, "measurementId");

  // Collect all other parameters into the params record, excluding secretValue
  const extraParams: Record<string, string> = {};
  if (Array.isArray(params)) {
    for (const p of params as AnyObj[]) {
      const k = str(p["key"]);
      const v = str(p["value"]);
      if (k === "eventName" || k === "measurementId") continue;
      // Defense in depth: never surface secret values
      if (k === "secretValue" || /secret/i.test(k)) continue;
      extraParams[k] = v;
    }
  }

  return {
    kind: "gtm_tag" as const,
    name: str(tg["name"]),
    config: {
      tagType: str(tg["type"]),
      ...(measurementId ? { measurementId } : {}),
      eventName,
      trigger: "", // trigger ID → name resolution deferred to apply orchestrator (M6)
      params: extraParams,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortByName<T extends { name: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.name.localeCompare(b.name));
}
