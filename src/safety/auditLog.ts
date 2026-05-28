import { appendFile, mkdir } from "node:fs/promises";
import { redact } from "../utils/redact.js";

export type AuditEvent =
  | "spec_loaded"
  | "validation_passed"
  | "validation_failed"
  | "diff_generated"
  | "workspace_capacity_checked"
  | "workspace_created"
  | "workspace_reused"
  | "workspace_blocked"
  | "gtm_apply_summary"
  | "ga4_apply_summary"
  | "version_created"
  | "version_blocked"
  | "publish_blocked"
  | "publish_succeeded";

const AUDIT_DIR = ".audit";

function dateStamp(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function audit(event: AuditEvent, payload: Record<string, unknown> = {}): Promise<void> {
  await mkdir(AUDIT_DIR, { recursive: true });
  const safePayload = redact(payload);
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...safePayload }) + "\n";
  const file = `${AUDIT_DIR}/audit-${dateStamp()}.log`;
  await appendFile(file, line, "utf8");
}
