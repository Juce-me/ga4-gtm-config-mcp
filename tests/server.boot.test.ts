// tests/server.boot.test.ts
import { afterEach, describe, it, expect, vi } from "vitest";
import { buildServer } from "../src/server.js";
import { assertSafeToolMetadata } from "../src/safety/toolMetadataGuards.js";

const EXPECTED_TOOL_NAMES = [
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
];

describe("server bootstrap", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("constructs without OAuth paths and retains the full safe tool catalog", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRETS", undefined);
    vi.stubEnv("GOOGLE_OAUTH_TOKEN_PATH", undefined);

    const { tools } = buildServer();
    expect(tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_TOOL_NAMES);
    expect(() => assertSafeToolMetadata(tools)).not.toThrow();
  });
});
