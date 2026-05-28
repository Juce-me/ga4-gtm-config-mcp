import { describe, it, expect } from "vitest";
import { readSpec } from "../src/spec/readSpec.js";
import { summarizeSpec } from "../src/spec/summarize.js";

describe("summarizeSpec", () => {
  it("produces a deterministic summary including all gates", async () => {
    const spec = await readSpec("tests/fixtures/specs/valid-web-dry-run.yaml");
    const summary = summarizeSpec(spec);
    expect(summary).toContain("environment: dev");
    expect(summary).toContain("publish_allowed: false");
    expect(summary).toContain("create_container_version_allowed: false");
    expect(summary).toContain("destructive_changes_allowed: false");
    expect(summary).toContain("gtm_web.tags:");
  });

  it("two summaries of the same spec are byte-identical", async () => {
    const spec = await readSpec("tests/fixtures/specs/valid-web-dry-run.yaml");
    expect(summarizeSpec(spec)).toBe(summarizeSpec(spec));
  });
});
