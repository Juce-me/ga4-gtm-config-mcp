import { describe, it, expect } from "vitest";
import { gateVersionCreation } from "../src/safety/versionGuards.js";

describe("versionGuards.gateVersionCreation", () => {
  const okInput = {
    spec: { execution: { create_container_version_allowed: true } } as any,
    approval_token: "tok",
    diff_report_path: "tests/fixtures/specs/valid-web-dry-run.yaml", // any existing file
    workspace_id: "1",
    unresolved_blocked_items: 0,
    unresolved_validation_errors: 0,
  };

  it("passes when every condition is satisfied", async () => {
    const r = await gateVersionCreation(okInput);
    expect(r.ok).toBe(true);
  });

  it("blocks if spec flag is false", async () => {
    const r = await gateVersionCreation({ ...okInput, spec: { execution: { create_container_version_allowed: false } } as any });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("VERSION_CREATION_BLOCKED");
  });

  it("blocks if approval_token is missing", async () => {
    const r = await gateVersionCreation({ ...okInput, approval_token: "" });
    expect(r.ok).toBe(false);
  });

  it("blocks on the live workspace", async () => {
    const r = await gateVersionCreation({ ...okInput, workspace_id: "0" });
    expect(r.ok).toBe(false);
  });

  it("collects multiple reasons in one result", async () => {
    const r = await gateVersionCreation({
      ...okInput,
      spec: { execution: { create_container_version_allowed: false } } as any,
      approval_token: "",
      workspace_id: "0",
    });
    expect(r.ok).toBe(false);
    expect(r.reasons!.length).toBeGreaterThanOrEqual(3);
  });
});
