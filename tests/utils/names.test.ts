import { describe, it, expect, vi } from "vitest";
import { datedWorkspaceName, slugifyEntityName } from "../../src/utils/names.js";

describe("names", () => {
  it("datedWorkspaceName uses UTC YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T10:00:00Z"));
    expect(datedWorkspaceName("ga4-instrumentation")).toBe("ga4-instrumentation-2026-05-28");
    vi.useRealTimers();
  });

  it("slugifyEntityName preserves human-readable shape", () => {
    expect(slugifyEntityName("DLV - eventParams.foo")).toBe("DLV - eventParams.foo");
  });
});
