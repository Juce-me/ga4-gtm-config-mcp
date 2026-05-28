import { stableStringify } from "../utils/stableJson.js";

export type UpsertAction = "create" | "unchanged" | "update";
export interface UpsertResult<T> {
  action: UpsertAction;
  entity: T;
}

const COMPARABLE_FIELDS_PER_TYPE: Record<string, string[]> = {
  variable: ["name", "type", "parameter"],
  trigger: ["name", "type", "customEventFilter", "filter"],
  tag: ["name", "type", "parameter", "firingTriggerId"],
};

/**
 * Compare an existing GTM entity to a desired payload by projecting both
 * onto the same field list. Ignores server-set metadata.
 */
export function gtmEntityMatches(
  kind: string,
  existing: Record<string, unknown>,
  payload: Record<string, unknown>,
): boolean {
  const fields = COMPARABLE_FIELDS_PER_TYPE[kind] ?? Object.keys(payload);
  const project = (o: Record<string, unknown>) =>
    Object.fromEntries(fields.map((f) => [f, o[f] ?? null]));
  return stableStringify(project(existing)) === stableStringify(project(payload));
}
