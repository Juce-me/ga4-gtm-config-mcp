import { access, readFile } from "node:fs/promises";
import type { McpExecutionSpec } from "../spec/mcpExecutionSpec.schema.js";
import type { GateResult } from "./versionGuards.js";

export interface PublishGateInput {
  spec: McpExecutionSpec;
  approval_token: string;
  validation_report_path: string;
  environment: string;
  version_id: string;
  publish_scope_present: boolean;
  operator_requested_publish: boolean;
  unresolved_validation_errors?: number;
}

export async function gatePublish(input: PublishGateInput): Promise<GateResult> {
  const reasons: string[] = [];

  if (input.spec.execution.publish_allowed !== true) {
    reasons.push("spec.execution.publish_allowed is not true");
  }
  if (!input.approval_token) {
    reasons.push("approval_token is missing or empty");
  }
  if (input.environment !== input.spec.target.environment) {
    reasons.push(
      `environment "${input.environment}" does not match spec.target.environment "${input.spec.target.environment}"`,
    );
  }
  if (!input.version_id) {
    reasons.push("version_id is missing or empty");
  }
  if (!input.publish_scope_present) {
    reasons.push("publish_scope_present is false");
  }
  if (!input.operator_requested_publish) {
    reasons.push("operator_requested_publish is false");
  }
  if ((input.unresolved_validation_errors ?? 0) > 0) {
    reasons.push(`${input.unresolved_validation_errors} unresolved validation errors`);
  }

  // Validate report file exists and content equals "passed"
  try {
    await access(input.validation_report_path);
    const content = await readFile(input.validation_report_path, "utf8");
    if (content.trim().toLowerCase() !== "passed") {
      reasons.push(`validation report content is not "passed": "${content.trim()}"`);
    }
  } catch {
    reasons.push(`validation_report_path does not exist: ${input.validation_report_path}`);
  }

  if (reasons.length > 0) {
    return { ok: false, code: "PUBLISH_BLOCKED", reasons };
  }
  return { ok: true };
}
