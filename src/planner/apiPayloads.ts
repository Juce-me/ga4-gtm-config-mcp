import type { NormalizedGa4, NormalizedGtm } from "./desiredState.js";

export type GtmParameter = { type: string; key?: string; value?: string; list?: GtmParameter[]; map?: GtmParameter[] };
export type GtmCondition = { type: string; parameter: GtmParameter[] };

const TRIGGER_TYPE_MAP: Record<string, string> = {
  custom_event: "customEvent",
  page_view: "pageview",
  history_change: "historyChange",
};

const OPERATOR_TYPE_MAP: Record<string, string> = {
  equals: "EQUALS",
  contains: "CONTAINS",
  starts_with: "STARTS_WITH",
  ends_with: "ENDS_WITH",
  matches_regex: "MATCHES_REGEX",
};

const BUILT_IN_VARIABLE_TYPES: Record<string, string> = {
  "Page URL": "pageUrl",
  "Page Path": "pagePath",
  "Page Hostname": "pageHostname",
  Referrer: "referrer",
  Event: "event",
};

const TAG_TYPE_MAP: Record<string, string> = {
  ga4_event: "gaawe",
};

export function desiredBuiltInVariableToGtmType(name: string): string {
  return BUILT_IN_VARIABLE_TYPES[name] ?? name;
}

export function desiredCustomDimensionToGa4Payload(config: NormalizedGa4["customDimensions"][number]["config"]) {
  return {
    parameterName: config.parameter_name,
    displayName: config.display_name,
    scope: config.scope,
    ...(config.description !== undefined ? { description: config.description } : {}),
  };
}

export function desiredCustomMetricToGa4Payload(config: NormalizedGa4["customMetrics"][number]["config"]) {
  return {
    parameterName: config.parameter_name,
    displayName: config.display_name,
    scope: config.scope,
    measurementUnit: config.unit,
    ...(config.description !== undefined ? { description: config.description } : {}),
  };
}

export function desiredKeyEventToGa4Payload(config: NormalizedGa4["keyEvents"][number]["config"]) {
  return {
    eventName: config.event_name,
  };
}

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
  const type = TRIGGER_TYPE_MAP[t.config.triggerType] ?? t.config.triggerType;
  const filters = t.config.filters.map((f) => condition(f.operator, `{{${f.variable}}}`, f.value));
  const eventFilter = t.config.eventName !== undefined && type === "customEvent"
    ? [condition("equals", "{{_event}}", t.config.eventName)]
    : [];

  const payload: {
    name: string;
    type: string;
    customEventFilter?: GtmCondition[];
    filter?: GtmCondition[];
  } = {
    name: t.name,
    type,
  };
  if (type === "customEvent") {
    if (eventFilter.length > 0) payload.customEventFilter = eventFilter;
    if (filters.length > 0) payload.filter = filters;
    return payload;
  }
  if (filters.length > 0) payload.filter = filters;
  return payload;
}

export function desiredTagToGtmPayload(tg: NormalizedGtm["tags"][number], triggerIdsByName: Map<string, string>) {
  const triggerId = triggerIdsByName.get(tg.config.trigger);
  if (triggerId === undefined) {
    throw new Error(`unresolved trigger "${tg.config.trigger}" for tag "${tg.name}"`);
  }

  const parameter: GtmParameter[] = [
    { type: "template", key: "eventName", value: tg.config.eventName },
  ];
  if (tg.config.measurementId) {
    parameter.push({ type: "template", key: "measurementId", value: tg.config.measurementId });
  }
  const eventParameters = Object.entries(tg.config.params).map(([k, v]) => ({
    type: "map",
    map: [
      { type: "template", key: "name", value: k },
      { type: "template", key: "value", value: v },
    ],
  }));
  if (eventParameters.length > 0) {
    parameter.push({ type: "list", key: "eventParameters", list: eventParameters });
  }
  return {
    name: tg.name,
    type: TAG_TYPE_MAP[tg.config.tagType] ?? tg.config.tagType,
    parameter,
    firingTriggerId: [triggerId],
  };
}

function condition(operator: string, arg0: string, arg1: string): GtmCondition {
  return {
    type: OPERATOR_TYPE_MAP[operator] ?? operator.toUpperCase(),
    parameter: [
      { type: "template", key: "arg0", value: arg0 },
      { type: "template", key: "arg1", value: arg1 },
    ],
  };
}
