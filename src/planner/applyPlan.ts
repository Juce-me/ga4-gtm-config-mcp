import type { Diff, DiffEntity } from "./diff.js";
import type { UpsertResult } from "../gtm/upsertResult.js";
import type { NormalizedGa4, NormalizedGtm } from "./desiredState.js";
import {
  desiredBuiltInVariableToGtmType,
  desiredCustomDimensionToGa4Payload,
  desiredCustomMetricToGa4Payload,
  desiredKeyEventToGa4Payload,
  desiredVariableToGtmPayload,
  desiredTriggerToGtmPayload,
  desiredTagToGtmPayload,
} from "./apiPayloads.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Upsert<T = unknown> = (...args: any[]) => Promise<UpsertResult<T>>;

export interface Writers {
  upsertCustomDimension: Upsert;
  upsertCustomMetric:    Upsert;
  upsertKeyEvent:        Upsert;
  upsertVariable:        Upsert;
  upsertTrigger:         Upsert;
  upsertTag:             Upsert;
  enableBuiltIn:         Upsert;
}

interface RawCurrent {
  ga4: {
    customDimensions: Array<{ name?: string; parameterName?: string } & Record<string, unknown>>;
    customMetrics:    Array<{ name?: string; parameterName?: string } & Record<string, unknown>>;
    keyEvents:        Array<{ name?: string; eventName?: string } & Record<string, unknown>>;
  };
  gtm: {
    builtInVariables: Array<{ name?: string; type?: string } & Record<string, unknown>>;
    variables:        Array<{ name?: string } & Record<string, unknown>>;
    triggers:         Array<{ name?: string; triggerId?: string } & Record<string, unknown>>;
    tags:             Array<{ name?: string } & Record<string, unknown>>;
  };
}

export interface ApplyPlanInput {
  diff: Diff;
  dryRun: boolean;
  writers: Writers;
  ga4PropertyId: string;
  gtmWorkspaceRef: string;
  currentRaw: RawCurrent;
}

export interface ApplyPlanResult {
  applied: number;
  skipped: number;
  blocked: number;
  unchanged: number;
  callsMade: number;
  details: Array<{ kind: string; name: string; outcome: "applied" | "skipped" | "blocked" | "unchanged"; reason?: string }>;
}

const GA4_KINDS = new Set(["ga4_custom_dimension", "ga4_custom_metric", "ga4_key_event"]);
const GTM_KINDS = new Set(["gtm_built_in_variable", "gtm_variable", "gtm_trigger", "gtm_tag"]);

export async function applyPlan(input: ApplyPlanInput): Promise<ApplyPlanResult> {
  const out: ApplyPlanResult = {
    applied: 0, skipped: 0, blocked: 0, unchanged: 0, callsMade: 0,
    details: [],
  };
  const triggerIdsByName = collectTriggerIds(input.currentRaw.gtm.triggers);

  // Unchanged entities are already correct — no write needed, no skip claim.
  for (const e of input.diff.unchanged) {
    out.unchanged++;
    out.details.push({ kind: e.kind, name: e.name, outcome: "unchanged" });
  }

  // Pre-classified blocked entries from the diff (forwards-compat with M5/M7 guards).
  for (const e of input.diff.blocked) {
    out.blocked++;
    out.details.push({ kind: e.kind, name: e.name, outcome: "blocked", reason: "blocked by diff" });
  }

  // Process creates + updates uniformly.
  for (const e of orderWrites([...input.diff.creates, ...input.diff.updates])) {
    if (!GA4_KINDS.has(e.kind) && !GTM_KINDS.has(e.kind)) {
      out.blocked++;
      out.details.push({ kind: e.kind, name: e.name, outcome: "blocked", reason: "unknown entity kind" });
      continue;
    }

    if (input.dryRun) {
      out.skipped++;
      out.details.push({ kind: e.kind, name: e.name, outcome: "skipped", reason: "dry_run" });
      continue;
    }

    try {
      await dispatchWrite(e, input, triggerIdsByName, out);
      out.applied++;
      out.details.push({ kind: e.kind, name: e.name, outcome: "applied" });
    } catch (err) {
      out.blocked++;
      out.details.push({ kind: e.kind, name: e.name, outcome: "blocked", reason: String(err) });
    }
  }

  return out;
}

async function dispatchWrite(
  e: DiffEntity,
  input: ApplyPlanInput,
  triggerIdsByName: Map<string, string>,
  out: ApplyPlanResult,
): Promise<void> {
  const { writers, ga4PropertyId, gtmWorkspaceRef, currentRaw } = input;

  switch (e.kind) {
    case "ga4_custom_dimension": {
      const existing = currentRaw.ga4.customDimensions.find((x) => x.parameterName === e.name);
      const payload = desiredCustomDimensionToGa4Payload(e.after as NormalizedGa4["customDimensions"][number]["config"]);
      out.callsMade++;
      await writers.upsertCustomDimension(undefined, ga4PropertyId, payload, existing);
      return;
    }
    case "ga4_custom_metric": {
      const existing = currentRaw.ga4.customMetrics.find((x) => x.parameterName === e.name);
      const payload = desiredCustomMetricToGa4Payload(e.after as NormalizedGa4["customMetrics"][number]["config"]);
      out.callsMade++;
      await writers.upsertCustomMetric(undefined, ga4PropertyId, payload, existing);
      return;
    }
    case "ga4_key_event": {
      const existing = currentRaw.ga4.keyEvents.find((x) => x.eventName === e.name);
      const payload = desiredKeyEventToGa4Payload(e.after as NormalizedGa4["keyEvents"][number]["config"]);
      out.callsMade++;
      await writers.upsertKeyEvent(undefined, ga4PropertyId, payload, existing);
      return;
    }
    case "gtm_built_in_variable": {
      out.callsMade++;
      await writers.enableBuiltIn(undefined, gtmWorkspaceRef, desiredBuiltInVariableToGtmType(e.name));
      return;
    }
    case "gtm_variable": {
      const existing = currentRaw.gtm.variables.find((x) => x.name === e.name);
      const payload = desiredVariableToGtmPayload({
        kind: "gtm_variable",
        name: e.name,
        config: e.after as NormalizedGtm["variables"][number]["config"],
      });
      out.callsMade++;
      await writers.upsertVariable(undefined, gtmWorkspaceRef, payload, existing);
      return;
    }
    case "gtm_trigger": {
      const existing = currentRaw.gtm.triggers.find((x) => x.name === e.name);
      const payload = desiredTriggerToGtmPayload({
        kind: "gtm_trigger",
        name: e.name,
        config: e.after as NormalizedGtm["triggers"][number]["config"],
      });
      out.callsMade++;
      const result = await writers.upsertTrigger(undefined, gtmWorkspaceRef, payload, existing);
      rememberTriggerId(triggerIdsByName, e.name, result.entity);
      return;
    }
    case "gtm_tag": {
      const existing = currentRaw.gtm.tags.find((x) => x.name === e.name);
      const payload = desiredTagToGtmPayload({
        kind: "gtm_tag",
        name: e.name,
        config: e.after as NormalizedGtm["tags"][number]["config"],
      }, triggerIdsByName);
      out.callsMade++;
      await writers.upsertTag(undefined, gtmWorkspaceRef, payload, existing);
      return;
    }
  }
}

function orderWrites(entities: DiffEntity[]): DiffEntity[] {
  return entities
    .map((entity, index) => ({ entity, index }))
    .sort((a, b) => writeRank(a.entity) - writeRank(b.entity) || a.index - b.index)
    .map(({ entity }) => entity);
}

function writeRank(e: DiffEntity): number {
  if (e.kind === "gtm_tag") return 2;
  if (e.kind === "gtm_trigger") return 1;
  return 0;
}

function collectTriggerIds(triggers: RawCurrent["gtm"]["triggers"]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const trigger of triggers) {
    if (typeof trigger.name === "string" && typeof trigger.triggerId === "string") {
      ids.set(trigger.name, trigger.triggerId);
    }
  }
  return ids;
}

function rememberTriggerId(ids: Map<string, string>, name: string, entity: unknown): void {
  if (!isRecord(entity)) return;
  const triggerId = entity["triggerId"];
  if (typeof triggerId === "string") {
    ids.set(name, triggerId);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
