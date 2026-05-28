import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { McpExecutionSpec } from "../src/spec/mcpExecutionSpec.schema.js";

describe("McpExecutionSpec zod schema", () => {
  it("accepts the valid-web-dry-run fixture", () => {
    const raw = parse(readFileSync("tests/fixtures/specs/valid-web-dry-run.yaml", "utf8"));
    const parsed = McpExecutionSpec.safeParse(raw);
    if (!parsed.success) console.error(parsed.error.format());
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown top-level keys", () => {
    const raw = { status: "planned", type: "ga4_gtm_mcp_execution_spec", version: 1, bogus: true };
    expect(McpExecutionSpec.safeParse(raw).success).toBe(false);
  });

  it("requires execution.publish_allowed and create_container_version_allowed to default to false", () => {
    const minimal = {
      status: "planned",
      type: "ga4_gtm_mcp_execution_spec",
      version: 1,
      target: { environment: "dev" },
      execution: { mode: "dry_run", workspace_name: "ws-2026-01-01" },
      ga4_admin: {},
      gtm_web: { enabled: true },
    };
    const parsed = McpExecutionSpec.parse(minimal);
    expect(parsed.execution.publish_allowed).toBe(false);
    expect(parsed.execution.create_container_version_allowed).toBe(false);
    expect(parsed.execution.destructive_changes_allowed).toBe(false);
  });
});
