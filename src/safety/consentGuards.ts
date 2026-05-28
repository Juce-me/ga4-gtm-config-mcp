import type { McpExecutionSpec } from "../spec/mcpExecutionSpec.schema.js";
import type { GateResult } from "./versionGuards.js";

const CONSENT_TAG_TYPES = new Set(["consent_initialization", "consent_settings"]);

export function gateConsentChange(spec: McpExecutionSpec): GateResult {
  const hasConsentTag = spec.gtm_web.tags.some((t) => CONSENT_TAG_TYPES.has(t.type));
  if (!hasConsentTag) {
    return { ok: true };
  }

  const consentGuard = spec.validation?.consent_change_guard;
  const approved = consentGuard !== undefined && consentGuard["modify_consent_settings"] === true;
  if (approved) {
    return { ok: true };
  }

  return {
    ok: false,
    code: "CONSENT_CHANGE_BLOCKED",
    reasons: [
      "Spec modifies consent without explicit approval in validation.consent_change_guard.modify_consent_settings",
    ],
  };
}
