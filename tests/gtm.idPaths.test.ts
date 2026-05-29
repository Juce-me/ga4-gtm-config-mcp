import { describe, it, expect } from "vitest";
import {
  accountId,
  containerId,
  workspaceId,
  versionId,
  containerPath,
  workspacePath,
  versionPath,
  containerVersionPath,
} from "../src/gtm/idPaths.js";

describe("gtm.idPaths", () => {
  it("extracts bare IDs from full resource names", () => {
    expect(accountId("accounts/123")).toBe("123");
    expect(containerId("accounts/123/containers/456")).toBe("456");
    expect(workspaceId("accounts/123/containers/456/workspaces/7")).toBe("7");
    expect(versionId("accounts/123/containers/456/versions/9")).toBe("9");
  });

  it("leaves bare IDs unchanged", () => {
    expect(accountId("123")).toBe("123");
    expect(containerId("456")).toBe("456");
    expect(workspaceId("7")).toBe("7");
  });

  it("builds normalized GTM API paths from mixed bare IDs and resource names", () => {
    expect(containerPath("accounts/123", "accounts/123/containers/456")).toBe(
      "accounts/123/containers/456",
    );
    expect(workspacePath("accounts/123", "accounts/123/containers/456", "workspaces/7")).toBe(
      "accounts/123/containers/456/workspaces/7",
    );
    expect(versionPath("accounts/123", "containers/456", "accounts/123/containers/456/workspaces/7")).toBe(
      "accounts/123/containers/456/workspaces/7",
    );
    expect(containerVersionPath("accounts/123", "containers/456", "accounts/123/containers/456/versions/9")).toBe(
      "accounts/123/containers/456/versions/9",
    );
  });
});
