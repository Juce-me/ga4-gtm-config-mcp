import { describe, it, expect } from "vitest";
import { requireApprovalToken } from "../src/safety/approvalGate.js";

describe("approvalGate.requireApprovalToken", () => {
  it("ok when spec flag is true and approval_token is non-empty", () => {
    expect(requireApprovalToken({
      action: "publish",
      spec: { execution: { publish_allowed: true } } as any,
      args: { approval_token: "abc" },
    }).ok).toBe(true);
  });

  it("blocks when spec flag is false", () => {
    expect(requireApprovalToken({
      action: "publish",
      spec: { execution: { publish_allowed: false } } as any,
      args: { approval_token: "abc" },
    }).ok).toBe(false);
  });

  it("blocks when approval_token is missing", () => {
    expect(requireApprovalToken({
      action: "create_version",
      spec: { execution: { create_container_version_allowed: true } } as any,
      args: {},
    }).ok).toBe(false);
  });

  it("supports both 'publish' and 'create_version' actions", () => {
    expect(requireApprovalToken({
      action: "create_version",
      spec: { execution: { create_container_version_allowed: true } } as any,
      args: { approval_token: "x" },
    }).ok).toBe(true);
  });
});
