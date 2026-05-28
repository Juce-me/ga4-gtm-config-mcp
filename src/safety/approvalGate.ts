import type { McpExecutionSpec } from "../spec/mcpExecutionSpec.schema.js";
import type { GateResult } from "./versionGuards.js";

export type ApprovalAction = "publish" | "create_version";

const FLAG_FOR_ACTION: Record<ApprovalAction, keyof McpExecutionSpec["execution"]> = {
  publish: "publish_allowed",
  create_version: "create_container_version_allowed",
};

export function requireApprovalToken(input: {
  action: ApprovalAction;
  spec: McpExecutionSpec;
  args: { approval_token?: string };
}): GateResult {
  const reasons: string[] = [];
  const flagKey = FLAG_FOR_ACTION[input.action];
  if (input.spec.execution[flagKey] !== true) {
    reasons.push(`spec.execution.${flagKey} is not true`);
  }
  if (!input.args.approval_token) {
    reasons.push("approval_token is missing");
  }
  if (reasons.length > 0) {
    const code = input.action === "publish" ? "PUBLISH_BLOCKED" : "VERSION_CREATION_BLOCKED";
    return { ok: false, code, reasons };
  }
  return { ok: true };
}
