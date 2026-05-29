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
