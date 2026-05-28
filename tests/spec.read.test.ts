import { describe, it, expect } from "vitest";
import { readSpec } from "../src/spec/readSpec.js";

describe("readSpec", () => {
  it("loads and parses the valid fixture", async () => {
    const spec = await readSpec("tests/fixtures/specs/valid-web-dry-run.yaml");
    expect(spec.type).toBe("ga4_gtm_mcp_execution_spec");
    expect(spec.version).toBe(1);
  });

  it("throws MCPError(SPEC_INVALID) on missing file", async () => {
    await expect(readSpec("tests/fixtures/specs/missing.yaml"))
      .rejects.toMatchObject({ code: "SPEC_INVALID" });
  });

  it("throws MCPError(SPEC_INVALID) on malformed YAML", async () => {
    await expect(readSpec("tests/fixtures/specs/_malformed.yaml"))
      .rejects.toMatchObject({ code: "SPEC_INVALID" });
  });
});
