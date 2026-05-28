import { describe, it, expect } from "vitest";
import { manualValidationChecklist, getPreviewInfo } from "../src/gtm/preview.js";

describe("gtm.preview.manualValidationChecklist", () => {
  it("returns a stable five-item list", () => {
    const list = manualValidationChecklist();
    expect(list.length).toBe(5);
    expect(list).toEqual(manualValidationChecklist()); // byte-stable across calls
    expect(list[3]).toContain("DebugView");
  });
});

describe("gtm.preview.getPreviewInfo", () => {
  it("returns workspace metadata + the checklist; never calls create_version or publish", async () => {
    const calls: string[] = [];
    const fakeGtm = {
      accounts: {
        containers: {
          workspaces: {
            get: async () => { calls.push("get"); return { data: { workspaceId: "7", name: "ga4-instrumentation-2026-05-28" } }; },
            create_version: async () => { calls.push("create_version"); return { data: {} }; },
          },
        },
      },
    } as unknown as Parameters<typeof getPreviewInfo>[0];

    const r = await getPreviewInfo(fakeGtm, "1", "2", "7");
    expect(calls).toEqual(["get"]);                       // ONLY get was called
    expect(r.manualChecklist.length).toBe(5);
    expect((r.workspace as { workspaceId: string }).workspaceId).toBe("7");
  });
});
