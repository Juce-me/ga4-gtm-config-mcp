// tests/server.boot.test.ts
import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";
import { assertSafeToolMetadata } from "../src/safety/toolMetadataGuards.js";

describe("server bootstrap", () => {
  it("registers exactly the 12 tools spanning M0-M7", () => {
    const { tools } = buildServer();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "apply_ga4_admin_changes",
      "apply_gtm_workspace_changes",
      "create_gtm_container_version_gated",
      "create_gtm_workspace",
      "diff_ga4_gtm_state",
      "get_gtm_preview_info",
      "publish_gtm_version_gated",
      "read_ga4_state",
      "read_gtm_state",
      "read_mcp_execution_spec",
      "summarize_mcp_execution_spec",
      "validate_mcp_execution_spec",
    ]);
  });

  it("every registered tool passes assertSafeToolMetadata", () => {
    const { tools } = buildServer();
    expect(() => assertSafeToolMetadata(tools)).not.toThrow();
  });
});
