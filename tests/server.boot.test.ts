// tests/server.boot.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildAuthMock } = vi.hoisted(() => ({
  buildAuthMock: vi.fn(),
}));

vi.mock("../src/auth/googleAuth.js", () => ({
  buildAuth: buildAuthMock,
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("constructs without resolving ADC and retains the full safe tool catalog", () => {
    const { tools } = buildServer();
    expect(buildAuthMock).not.toHaveBeenCalled();
    expect(tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_TOOL_NAMES);
    expect(() => assertSafeToolMetadata(tools)).not.toThrow();
  });
});
