import type { McpExecutionSpec } from "./mcpExecutionSpec.schema.js";
import type { ErrorCode } from "../utils/errors.js";
import { findPiiViolations } from "../safety/piiGuards.js";

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
  "cid", "currency", "request_id", "order_id", "result_id",
]);

const SECRET_KEY_RE = /(token|secret|password|refresh_token|api[_-]?key|oauth|client_secret)/i;
const URL_WITH_QUERY_RE = /^https?:\/\/[^\s?]+\?[^\s]+$/;
const GA4_RESERVED_PREFIXES = ["_", "firebase_", "ga_", "google_", "gtag."];
const TAG_PARAM_LIMIT = 25;

function isTemplateValue(value: string): boolean {
  return /^\{\{.*\}\}$/.test(value);
}

function isUnsafeGa4Name(name: string): boolean {
  return name.length > 40 || GA4_RESERVED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function forbiddenCode(value: string): ErrorCode {
  return SECRET_KEY_RE.test(value) ? "SECRET_DETECTED" : "PII_DETECTED";
}

function addForbiddenKeyFindings(
  errors: ValidationFinding[],
  spec: McpExecutionSpec,
  value: string,
  path: string,
): void {
  const forbidden = spec.validation?.forbidden_keys;
  if (!forbidden) return;

  if (forbidden.exact.some((s) => value === s)) {
    errors.push({
      code: forbiddenCode(value),
      message: `"${value}" matches validation.forbidden_keys.exact`,
      path,
    });
  }

  if (forbidden.contains.some((s) => value.includes(s))) {
    errors.push({
      code: forbiddenCode(value),
      message: `"${value}" matches validation.forbidden_keys.contains`,
      path,
    });
  }

  for (const pattern of forbidden.patterns) {
    if (new RegExp(pattern).test(value)) {
      errors.push({
        code: forbiddenCode(value),
        message: `"${value}" matches validation.forbidden_keys.patterns`,
        path,
      });
    }
  }
}

export function validateSpec(spec: McpExecutionSpec): ValidationResult {
  const errors: ValidationFinding[] = [];
  const warnings: ValidationFinding[] = [];

  findPiiViolations({ built_in_variables: spec.gtm_web.built_in_variables }).forEach((finding) => {
    errors.push({
      code: finding.code,
      message: finding.message,
      path: `gtm_web.${finding.path}`,
    });
  });

  // 1. UA-style params in any tag.params key.
  spec.gtm_web.tags.forEach((tag, i) => {
    const paramCount = Object.keys(tag.params).length;
    if (paramCount > TAG_PARAM_LIMIT) {
      errors.push({
        code: "SPEC_INVALID",
        message: `Tag "${tag.name}" has ${paramCount} params; normal GTM tags may have at most ${TAG_PARAM_LIMIT}`,
        path: `gtm_web.tags[${i}].params`,
      });
    }

    if (!isTemplateValue(tag.event_name) && isUnsafeGa4Name(tag.event_name)) {
      errors.push({
        code: "SPEC_INVALID",
        message: `Tag "${tag.name}" uses unsafe GA4 event name "${tag.event_name}"`,
        path: `gtm_web.tags[${i}].event_name`,
      });
    }

    findPiiViolations({ params: tag.params }).forEach((finding) => {
      errors.push({
        code: finding.code,
        message: `Tag "${tag.name}" ${finding.message}`,
        path: finding.path.replace("params", `gtm_web.tags[${i}].params`),
      });
    });

    for (const k of Object.keys(tag.params)) {
      if (SECRET_KEY_RE.test(k)) {
        errors.push({
          code: "SECRET_DETECTED",
          message: `Tag "${tag.name}" param key "${k}" looks like a credential`,
          path: `gtm_web.tags[${i}].params.${k}`,
        });
      }
      if (FORBIDDEN_UA_PARAMS.has(k)) {
        errors.push({
          code: "SPEC_INVALID",
          message: `Tag "${tag.name}" uses forbidden UA-style param "${k}"`,
          path: `gtm_web.tags[${i}].params.${k}`,
        });
      }
      if (isUnsafeGa4Name(k)) {
        errors.push({
          code: "SPEC_INVALID",
          message: `Tag "${tag.name}" uses unsafe GA4 param name "${k}"`,
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

  // 3. Spec-level forbidden keys apply across planner-controlled names and values.
  spec.gtm_web.tags.forEach((tag, i) => {
    for (const [k, v] of Object.entries(tag.params)) {
      addForbiddenKeyFindings(errors, spec, k, `gtm_web.tags[${i}].params.${k}`);
      addForbiddenKeyFindings(errors, spec, v, `gtm_web.tags[${i}].params.${k}`);
    }
  });
  spec.gtm_web.data_layer_variables.forEach((dlv, i) => {
    addForbiddenKeyFindings(errors, spec, dlv.data_layer_variable_name, `gtm_web.data_layer_variables[${i}].data_layer_variable_name`);
  });
  spec.ga4_admin.custom_dimensions.forEach((cd, i) => {
    addForbiddenKeyFindings(errors, spec, cd.parameter_name, `ga4_admin.custom_dimensions[${i}].parameter_name`);
  });
  spec.ga4_admin.custom_metrics.forEach((cm, i) => {
    addForbiddenKeyFindings(errors, spec, cm.parameter_name, `ga4_admin.custom_metrics[${i}].parameter_name`);
  });
  spec.ga4_admin.key_events.forEach((ke, i) => {
    addForbiddenKeyFindings(errors, spec, ke.event_name, `ga4_admin.key_events[${i}].event_name`);
  });

  // 4. Full URL with query string as a tag param value.
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

  // 5. GA4 naming and high-cardinality custom dimension guards.
  spec.ga4_admin.custom_dimensions.forEach((cd, i) => {
    if (isUnsafeGa4Name(cd.parameter_name)) {
      errors.push({
        code: "SPEC_INVALID",
        message: `Custom dimension "${cd.parameter_name}" uses an unsafe GA4 parameter name`,
        path: `ga4_admin.custom_dimensions[${i}].parameter_name`,
      });
    }
    if (HIGH_CARD_PARAMS.has(cd.parameter_name)) {
      errors.push({
        code: "PII_DETECTED",
        message: `Custom dimension "${cd.parameter_name}" is high-cardinality and disallowed`,
        path: `ga4_admin.custom_dimensions[${i}]`,
      });
    }
  });
  spec.ga4_admin.custom_metrics.forEach((cm, i) => {
    if (isUnsafeGa4Name(cm.parameter_name)) {
      errors.push({
        code: "SPEC_INVALID",
        message: `Custom metric "${cm.parameter_name}" uses an unsafe GA4 parameter name`,
        path: `ga4_admin.custom_metrics[${i}].parameter_name`,
      });
    }
  });
  spec.ga4_admin.key_events.forEach((ke, i) => {
    if (isUnsafeGa4Name(ke.event_name)) {
      errors.push({
        code: "SPEC_INVALID",
        message: `Key event "${ke.event_name}" uses an unsafe GA4 event name`,
        path: `ga4_admin.key_events[${i}].event_name`,
      });
    }
  });

  // 6. Per-event tag explosion: more than 1 ga4_event tag whose event_name is a literal
  //    (not a {{template}}) AND not "page_view" is the failure pattern.
  const literalEventTags = spec.gtm_web.tags.filter(
    (t) => t.type === "ga4_event" && !isTemplateValue(t.event_name) && t.event_name !== "page_view",
  );
  if (literalEventTags.length > 1) {
    errors.push({
      code: "SPEC_INVALID",
      message: `Per-event GTM tag pattern detected (${literalEventTags.length} literal-event tags). Use the reusable "GA4 - User Event" tag with {{DLV - event_name}}.`,
      path: "gtm_web.tags",
    });
  }

  // 7. Consent guard.
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

  // 8. Missing target IDs for non-dry-run modes.
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
