import type { McpExecutionSpec } from "./mcpExecutionSpec.schema.js";
import type { ErrorCode } from "../utils/errors.js";

export interface ValidationFinding {
  code: ErrorCode;
  message: string;
  path: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
}

const FORBIDDEN_UA_PARAMS = new Set([
  "event_category", "event_action", "event_label", "event_group", "ga4_event_name",
]);

const HIGH_CARD_PARAMS = new Set([
  "user_id", "client_id", "session_id", "transaction_id",
  "request_id", "order_id", "result_id",
]);

const SECRET_KEY_RE = /(token|secret|password|refresh_token|api[_-]?key|oauth|client_secret)/i;
const URL_WITH_QUERY_RE = /^https?:\/\/[^\s?]+\?[^\s]+$/;

export function validateSpec(spec: McpExecutionSpec): ValidationResult {
  const errors: ValidationFinding[] = [];
  const warnings: ValidationFinding[] = [];

  // 1. UA-style params in any tag.params key.
  spec.gtm_web.tags.forEach((tag, i) => {
    for (const k of Object.keys(tag.params)) {
      if (FORBIDDEN_UA_PARAMS.has(k)) {
        errors.push({
          code: "SPEC_INVALID",
          message: `Tag "${tag.name}" uses forbidden UA-style param "${k}"`,
          path: `gtm_web.tags[${i}].params.${k}`,
        });
      }
    }
  });

  // 2. Secret-shaped DLV names.
  spec.gtm_web.data_layer_variables.forEach((dlv, i) => {
    if (SECRET_KEY_RE.test(dlv.data_layer_variable_name) || SECRET_KEY_RE.test(dlv.name)) {
      errors.push({
        code: "SECRET_DETECTED",
        message: `DLV "${dlv.name}" looks like a credential`,
        path: `gtm_web.data_layer_variables[${i}]`,
      });
    }
  });

  // 3. Full URL with query string as a tag param value.
  spec.gtm_web.tags.forEach((tag, i) => {
    for (const [k, v] of Object.entries(tag.params)) {
      if (v !== undefined && URL_WITH_QUERY_RE.test(v)) {
        errors.push({
          code: "PII_DETECTED",
          message: `Tag "${tag.name}" param "${k}" is a full URL with query string`,
          path: `gtm_web.tags[${i}].params.${k}`,
        });
      }
    }
  });

  // 4. High-cardinality custom dimensions.
  spec.ga4_admin.custom_dimensions.forEach((cd, i) => {
    if (HIGH_CARD_PARAMS.has(cd.parameter_name)) {
      errors.push({
        code: "PII_DETECTED",
        message: `Custom dimension "${cd.parameter_name}" is high-cardinality and disallowed`,
        path: `ga4_admin.custom_dimensions[${i}]`,
      });
    }
  });

  // 5. Per-event tag explosion: more than 1 ga4_event tag whose event_name is a literal
  //    (not a {{template}}) AND not "page_view" is the failure pattern.
  const literalEventTags = spec.gtm_web.tags.filter(
    (t) => t.type === "ga4_event" && !/^\{\{.*\}\}$/.test(t.event_name) && t.event_name !== "page_view",
  );
  if (literalEventTags.length > 1) {
    errors.push({
      code: "SPEC_INVALID",
      message: `Per-event GTM tag pattern detected (${literalEventTags.length} literal-event tags). Use the reusable "GA4 - User Event" tag with {{DLV - event_name}}.`,
      path: "gtm_web.tags",
    });
  }

  // 6. Consent guard.
  const consentTagTypes = new Set(["consent_initialization", "consent_settings"]);
  const consentChange = spec.gtm_web.tags.some((t) => consentTagTypes.has(t.type));
  const consentGuard = spec.validation?.consent_change_guard;
  const consentApproved = consentGuard !== undefined && consentGuard["modify_consent_settings"] === true;
  if (consentChange && !consentApproved) {
    errors.push({
      code: "CONSENT_CHANGE_BLOCKED",
      message: "Spec modifies consent without explicit approval in validation.consent_change_guard.modify_consent_settings",
      path: "validation.consent_change_guard",
    });
  }

  // 7. Missing target IDs for non-dry-run modes.
  if (spec.execution.mode !== "dry_run") {
    if (!spec.target.ga4_property_id) {
      errors.push({
        code: "MISSING_TARGET_ID",
        message: "ga4_property_id is required for non-dry-run mode",
        path: "target.ga4_property_id",
      });
    }
    if (!spec.target.gtm_account_id || !spec.target.gtm_web_container_id) {
      errors.push({
        code: "MISSING_TARGET_ID",
        message: "gtm_account_id and gtm_web_container_id are required for non-dry-run mode",
        path: "target",
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
