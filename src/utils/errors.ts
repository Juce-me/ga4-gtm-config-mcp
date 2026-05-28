export const ERROR_CODES = [
  "SPEC_INVALID",
  "MISSING_TARGET_ID",
  "SECRET_DETECTED",
  "PII_DETECTED",
  "WORKSPACE_CAPACITY_BLOCKED",
  "WORKSPACE_UNSAFE",
  "VERSION_CREATION_BLOCKED",
  "PUBLISH_BLOCKED",
  "API_UNSUPPORTED",
  "PERMISSION_DENIED",
  "NAME_COLLISION",
  "CONSENT_CHANGE_BLOCKED",
] as const;

export type ErrorCode = typeof ERROR_CODES[number];

export class MCPError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "MCPError";
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}
