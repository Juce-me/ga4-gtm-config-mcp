import type { McpExecutionSpec } from "../spec/mcpExecutionSpec.schema.js";

// ─── Canonical internal model ────────────────────────────────────────────────
// All four files in this module (desiredState, currentState, diff, payloads)
// share exactly this shape. Import from here; never redefine elsewhere.

export interface NormalizedGa4 {
  customDimensions: Array<{
    kind: "ga4_custom_dimension";
    name: string;
    config: { parameter_name: string; display_name: string; scope: string; description?: string };
  }>;
  customMetrics: Array<{
    kind: "ga4_custom_metric";
    name: string;
    config: { parameter_name: string; display_name: string; scope: string; unit: string; description?: string };
  }>;
  keyEvents: Array<{
    kind: "ga4_key_event";
    name: string;
    config: { event_name: string };
  }>;
}

export interface NormalizedGtm {
  builtInVariables: Array<{ kind: "gtm_built_in_variable"; name: string; config: Record<string, never> }>;
  variables: Array<{
    kind: "gtm_variable";
    name: string;
    config: { variableType: "dlv"; dlvName: string; dlvVersion: 1 | 2 };
  }>;
  triggers: Array<{
    kind: "gtm_trigger";
    name: string;
    config: {
      triggerType: string;
      eventName?: string;
      filters: Array<{ variable: string; operator: string; value: string }>;
    };
  }>;
  tags: Array<{
    kind: "gtm_tag";
    name: string;
    config: {
      tagType: string;
      measurementId?: string;
      eventName: string;
      trigger: string;
      params: Record<string, string>;
    };
  }>;
}

export interface NormalizedState {
  ga4: NormalizedGa4;
  gtm: NormalizedGtm;
}

// ─── Desired-state normalizer ─────────────────────────────────────────────────

function sortByName<T extends { name: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.name.localeCompare(b.name));
}

export function toDesiredState(spec: McpExecutionSpec): NormalizedState {
  const ga4: NormalizedGa4 = {
    customDimensions: sortByName(
      spec.ga4_admin.custom_dimensions.map((cd) => ({
        kind: "ga4_custom_dimension" as const,
        name: cd.parameter_name,
        config: {
          parameter_name: cd.parameter_name,
          display_name: cd.display_name,
          scope: cd.scope,
          ...(cd.description !== undefined ? { description: cd.description } : {}),
        },
      })),
    ),
    customMetrics: sortByName(
      spec.ga4_admin.custom_metrics.map((cm) => ({
        kind: "ga4_custom_metric" as const,
        name: cm.parameter_name,
        config: {
          parameter_name: cm.parameter_name,
          display_name: cm.display_name,
          scope: cm.scope,
          unit: cm.unit,
          ...(cm.description !== undefined ? { description: cm.description } : {}),
        },
      })),
    ),
    keyEvents: sortByName(
      spec.ga4_admin.key_events.map((ke) => ({
        kind: "ga4_key_event" as const,
        name: ke.event_name,
        config: { event_name: ke.event_name },
      })),
    ),
  };

  const gtm: NormalizedGtm = {
    builtInVariables: sortByName(
      spec.gtm_web.built_in_variables.map((s) => ({
        kind: "gtm_built_in_variable" as const,
        name: s,
        config: {} as Record<string, never>,
      })),
    ),
    variables: sortByName(
      spec.gtm_web.data_layer_variables.map((dlv) => ({
        kind: "gtm_variable" as const,
        name: dlv.name,
        config: {
          variableType: "dlv" as const,
          dlvName: dlv.data_layer_variable_name,
          dlvVersion: dlv.version,
        },
      })),
    ),
    triggers: sortByName(
      spec.gtm_web.triggers.map((t) => ({
        kind: "gtm_trigger" as const,
        name: t.name,
        config: {
          triggerType: t.type,
          ...(t.event_name !== undefined ? { eventName: t.event_name } : {}),
          filters: t.filters.map((f) => ({
            variable: f.variable,
            operator: f.operator,
            value: f.value,
          })),
        },
      })),
    ),
    tags: sortByName(
      spec.gtm_web.tags.map((t) => ({
        kind: "gtm_tag" as const,
        name: t.name,
        config: {
          tagType: t.type,
          ...(t.measurement_id !== undefined ? { measurementId: t.measurement_id } : {}),
          eventName: t.event_name,
          trigger: t.trigger,
          params: t.params,
        },
      })),
    ),
  };

  return { ga4, gtm };
}

// ─── GTM payload helpers (desired → GTM v2 API request bodies) ────────────────

const TRIGGER_TYPE_MAP: Record<string, string> = {
  custom_event: "customEvent",
  page_view: "pageview",
  history_change: "historyChange",
};

export function desiredVariableToGtmPayload(v: NormalizedGtm["variables"][number]) {
  return {
    name: v.name,
    type: "v",
    parameter: [
      { type: "template", key: "name", value: v.config.dlvName },
      { type: "integer", key: "dataLayerVersion", value: String(v.config.dlvVersion) },
    ],
  };
}

export function desiredTriggerToGtmPayload(t: NormalizedGtm["triggers"][number]) {
  return {
    name: t.name,
    type: TRIGGER_TYPE_MAP[t.config.triggerType] ?? t.config.triggerType,
    customEventFilter: t.config.filters.map((f) => ({
      type: f.operator.toUpperCase(),
      parameter: [
        { type: "template", key: "arg0", value: `{{${f.variable}}}` },
        { type: "template", key: "arg1", value: f.value },
      ],
    })),
  };
}

export function desiredTagToGtmPayload(tg: NormalizedGtm["tags"][number]) {
  const parameter: Array<{ type: string; key: string; value: string }> = [
    { type: "template", key: "eventName", value: tg.config.eventName },
  ];
  if (tg.config.measurementId) {
    parameter.push({ type: "template", key: "measurementId", value: tg.config.measurementId });
  }
  for (const [k, v] of Object.entries(tg.config.params)) {
    parameter.push({ type: "template", key: k, value: v });
  }
  return {
    name: tg.name,
    type: tg.config.tagType,
    parameter,
    // firingTriggerId is resolved to numeric IDs at apply-time; for payload shape purposes, the name is kept here.
    firingTriggerId: [tg.config.trigger],
  };
}
