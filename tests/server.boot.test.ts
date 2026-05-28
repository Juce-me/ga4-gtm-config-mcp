// tests/server.boot.test.ts
import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";
import { assertSafeToolMetadata } from "../src/safety/toolMetadataGuards.js";

describe("server bootstrap", () => {
  it("registers exactly the three M0-M3 tools", () => {
    const { tools } = buildServer();
    expect(tools.map((t) => t.name).sort()).toEqual([
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
