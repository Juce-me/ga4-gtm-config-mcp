import { describe, it, expect } from "vitest";
import { assertWorkspaceSafe, checkCapacity } from "../src/safety/workspaceGuards.js";

describe("workspaceGuards", () => {
  it("rejects the live/default workspace", () => {
    expect(() => assertWorkspaceSafe({ workspaceId: "0", name: "Default Workspace" })).toThrow(/WORKSPACE_UNSAFE/);
  });

  it("rejects the live workspace when passed as a full resource name", () => {
    expect(() => assertWorkspaceSafe({ workspaceId: "accounts/1/containers/2/workspaces/0", name: "" })).toThrow(/WORKSPACE_UNSAFE/);
  });

  it("rejects a non-zero workspace id whose name says 'Default Workspace'", () => {
    expect(() => assertWorkspaceSafe({ workspaceId: "12345", name: "Default Workspace" })).toThrow(/WORKSPACE_UNSAFE/);
  });

  it("accepts a normal user workspace", () => {
    expect(() => assertWorkspaceSafe({ workspaceId: "12345", name: "ga4-instrumentation-2026-05-28" })).not.toThrow();
  });

  it("blocks when GTM has no free workspace slots", () => {
    const r = checkCapacity({ existingWorkspaces: 3, maxWorkspaces: 3 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("WORKSPACE_CAPACITY_BLOCKED");
  });

  it("passes when one slot is free", () => {
    expect(checkCapacity({ existingWorkspaces: 2, maxWorkspaces: 3 }).ok).toBe(true);
  });
});
