import { access } from "node:fs/promises";
import type { McpExecutionSpec } from "../spec/mcpExecutionSpec.schema.js";
import type { ErrorCode } from "../utils/errors.js";
import { workspaceId as normalizeWorkspaceId } from "../gtm/idPaths.js";

export interface VersionGateInput {
  spec: McpExecutionSpec;
  approval_token: string;
  diff_report_path: string;
  workspace_id: string;
  unresolved_blocked_items: number;
  unresolved_validation_errors: number;
}

export interface GateResult {
  ok: boolean;
  code?: ErrorCode;
  reasons?: string[];
}

export async function gateVersionCreation(input: VersionGateInput): Promise<GateResult> {
  const reasons: string[] = [];

  if (input.spec.execution.create_container_version_allowed !== true) {
    reasons.push("spec.execution.create_container_version_allowed is not true");
  }
  if (!input.approval_token) {
    reasons.push("approval_token is missing or empty");
  }
  if (normalizeWorkspaceId(input.workspace_id) === "0") {
    reasons.push("workspace_id refers to the live/default workspace");
  }
  if (input.unresolved_blocked_items > 0) {
    reasons.push(`${input.unresolved_blocked_items} unresolved blocked items in diff`);
  }
  if (input.unresolved_validation_errors > 0) {
    reasons.push(`${input.unresolved_validation_errors} unresolved validation errors`);
  }
  try {
    await access(input.diff_report_path);
  } catch {
    reasons.push(`diff_report_path does not exist: ${input.diff_report_path}`);
  }

  if (reasons.length > 0) {
    return { ok: false, code: "VERSION_CREATION_BLOCKED", reasons };
  }
  return { ok: true };
}
