import type { ErrorCode } from "../utils/errors.js";

export interface PiiFinding {
  code: ErrorCode;
  message: string;
  path: string;
}

const FORBIDDEN_PARAM_KEYS = new Set(["email", "name", "phone", "ip", "user_agent", "referrer"]);
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

  // built_in_variables entries (e.g. "Referrer", "Page URL") are not violations on their own.

  return findings;
}
