import type { ErrorCode } from "../utils/errors.js";

export interface PiiFinding {
  code: ErrorCode;
  message: string;
  path: string;
}

const FORBIDDEN_PARAM_KEYS = new Set(["email", "name", "phone", "ip", "user_agent", "referrer"]);
const SUPPORTED_GTM_BUILT_INS = new Set(["Page URL", "Page Path", "Page Hostname", "Referrer", "Event"]);
const URL_WITH_QUERY_RE = /^https?:\/\/[^\s?]+\?[^\s]+$/;

export function findPiiViolations(input: {
  params?: Record<string, string>;
  built_in_variables?: string[];
}): PiiFinding[] {
  const findings: PiiFinding[] = [];

  if (input.params) {
    for (const [key, value] of Object.entries(input.params)) {
      if (FORBIDDEN_PARAM_KEYS.has(key)) {
        findings.push({
          code: "PII_DETECTED",
          message: `Param key "${key}" is a forbidden PII identifier`,
          path: `params.${key}`,
        });
      }
      if (URL_WITH_QUERY_RE.test(value)) {
        findings.push({
          code: "PII_DETECTED",
          message: `Param "${key}" contains a full URL with query string which may leak PII`,
          path: `params.${key}`,
        });
      }
    }
  }

  if (input.built_in_variables) {
    input.built_in_variables.forEach((name, i) => {
      if (!SUPPORTED_GTM_BUILT_INS.has(name)) {
        findings.push({
          code: "SPEC_INVALID",
          message: `GTM built-in variable "${name}" is not supported by the planner-facing contract`,
          path: `built_in_variables[${i}]`,
        });
      }
    });
  }

  return findings;
}
