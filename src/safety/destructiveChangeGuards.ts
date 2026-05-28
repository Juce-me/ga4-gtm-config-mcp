import type { McpExecutionSpec } from "../spec/mcpExecutionSpec.schema.js";
import type { ErrorCode } from "../utils/errors.js";

export interface DestructiveFinding {
  code: ErrorCode;
  message: string;
  path: string;
}

export interface Diff {
  deletes: Array<{ kind: string; name: string }>;
  updates: Array<unknown>;
  creates: Array<unknown>;
  archives: Array<{ kind: string; name: string }>;
}

export function findDestructiveChanges(diff: Diff, spec: McpExecutionSpec): DestructiveFinding[] {
  const findings: DestructiveFinding[] = [];

  // Archives of GA4 custom definitions are never supported, regardless of the flag.
  for (const entry of diff.archives) {
    findings.push({
      code: "API_UNSUPPORTED",
      message: `Archive of "${entry.name}" (${entry.kind}) is not supported. GA4 custom definition archiving is outside the scope of this server.`,
      path: `diff.archives[${entry.name}]`,
    });
  }

  // Deletes require explicit opt-in via destructive_changes_allowed.
  if (!spec.execution.destructive_changes_allowed) {
    for (const entry of diff.deletes) {
      findings.push({
        code: "SPEC_INVALID",
        message: `Delete of "${entry.name}" (${entry.kind}) is not allowed. Set execution.destructive_changes_allowed: true to permit deletes.`,
        path: `diff.deletes[${entry.name}]`,
      });
    }
  }

  return findings;
}
