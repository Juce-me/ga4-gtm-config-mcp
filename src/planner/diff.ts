import { stableStringify } from "../utils/stableJson.js";
import type { NormalizedState } from "./desiredState.js";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DiffEntity {
  kind: string;
  name: string;
  status: "create" | "update" | "unchanged";
  before?: unknown; // present for update
  after?: unknown;  // present for create / update
}

export interface Diff {
  creates: DiffEntity[];
  updates: DiffEntity[];
  unchanged: DiffEntity[];
  /** Populated by the apply orchestrator when a rule blocks an entity (M6). */
  skipped: DiffEntity[];
  /** Populated by the apply orchestrator when a rule hard-blocks an entity (M6). */
  blocked: DiffEntity[];
  /** Populated by the apply orchestrator for soft warnings (M6). */
  warnings: string[];
}

// ─── Diff algorithm ───────────────────────────────────────────────────────────

export function diffStates(desired: NormalizedState, current: NormalizedState): Diff {
  const creates: DiffEntity[] = [];
  const updates: DiffEntity[] = [];
  const unchanged: DiffEntity[] = [];

  // Helper that processes one kind-group
  function processGroup<T extends { kind: string; name: string; config: unknown }>(
    desiredArr: T[],
    currentArr: T[],
  ) {
    const currentMap = new Map<string, T>(currentArr.map((e) => [e.name, e]));

    for (const d of desiredArr) {
      const c = currentMap.get(d.name);
      if (!c) {
        creates.push({ kind: d.kind, name: d.name, status: "create", after: d.config });
      } else if (stableStringify(d.config) === stableStringify(c.config)) {
        unchanged.push({ kind: d.kind, name: d.name, status: "unchanged" });
      } else {
        updates.push({ kind: d.kind, name: d.name, status: "update", before: c.config, after: d.config });
      }
    }
    // Current-only entities are intentionally not classified as deletes.
    // Destructive operations are handled by the destructive guard (M3/M6).
  }

  // GA4
  processGroup(desired.ga4.customDimensions, current.ga4.customDimensions);
  processGroup(desired.ga4.customMetrics, current.ga4.customMetrics);
  processGroup(desired.ga4.keyEvents, current.ga4.keyEvents);

  // GTM
  processGroup(desired.gtm.builtInVariables, current.gtm.builtInVariables);
  processGroup(desired.gtm.variables, current.gtm.variables);
  processGroup(desired.gtm.triggers, current.gtm.triggers);
  processGroup(desired.gtm.tags, current.gtm.tags);

  // Sort each list for byte-stable output across runs
  const byName = (a: DiffEntity, b: DiffEntity) => a.name.localeCompare(b.name);
  creates.sort(byName);
  updates.sort(byName);
  unchanged.sort(byName);

  return { creates, updates, unchanged, skipped: [], blocked: [], warnings: [] };
}
