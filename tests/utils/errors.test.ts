import { describe, it, expect } from "vitest";
import { MCPError, ErrorCode } from "../../src/utils/errors.js";

describe("MCPError", () => {
  it("carries machine-readable code", () => {
    const e = new MCPError("SPEC_INVALID", "bad schema", { field: "execution.mode" });
    expect(e.code).toBe("SPEC_INVALID");
    expect(e.message).toBe("bad schema");
    expect(e.details).toEqual({ field: "execution.mode" });
  });

  it("serializes to JSON shape consumers can return", () => {
    const e = new MCPError("PUBLISH_BLOCKED", "no approval token");
    expect(e.toJSON()).toEqual({
      error: { code: "PUBLISH_BLOCKED", message: "no approval token", details: {} },
    });
  });

  it("enumerates all 12 error codes", () => {
    const expected = [
      "SPEC_INVALID","MISSING_TARGET_ID","SECRET_DETECTED","PII_DETECTED",
      "WORKSPACE_CAPACITY_BLOCKED","WORKSPACE_UNSAFE","VERSION_CREATION_BLOCKED",
      "PUBLISH_BLOCKED","API_UNSUPPORTED","PERMISSION_DENIED","NAME_COLLISION",
      "CONSENT_CHANGE_BLOCKED"
    ] satisfies ErrorCode[];
    expect(expected.length).toBe(12);
  });
});
