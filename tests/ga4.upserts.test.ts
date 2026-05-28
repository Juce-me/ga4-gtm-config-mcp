import { describe, it, expect } from "vitest";
import { upsertCustomDimension } from "../src/ga4/customDimensions.js";
import { upsertCustomMetric } from "../src/ga4/customMetrics.js";
import { upsertKeyEvent } from "../src/ga4/keyEvents.js";

type Spy = { calls: string[] };
function fake(spy: Spy, resource: "customDimensions" | "customMetrics" | "keyEvents") {
  return {
    properties: {
      [resource]: {
        create: async (args: unknown) => { spy.calls.push("create"); return { data: (args as { requestBody: object }).requestBody }; },
        patch: async (args: unknown) => { spy.calls.push("patch"); return { data: (args as { requestBody: object }).requestBody }; },
      },
    },
  } as unknown as Parameters<typeof upsertCustomDimension>[0];
}

describe("ga4 upsert helpers", () => {
  it("CD: create when no existing", async () => {
    const spy: Spy = { calls: [] };
    const r = await upsertCustomDimension(fake(spy, "customDimensions"), "properties/1", { parameterName: "p", displayName: "P", scope: "EVENT" });
    expect(r.action).toBe("create");
  });

  it("CD: unchanged when comparable fields match", async () => {
    const spy: Spy = { calls: [] };
    const r = await upsertCustomDimension(
      fake(spy, "customDimensions"),
      "properties/1",
      { parameterName: "p", displayName: "P", scope: "EVENT" },
      { name: "properties/1/customDimensions/9", parameterName: "p", displayName: "P", scope: "EVENT" },
    );
    expect(r.action).toBe("unchanged");
    expect(spy.calls).toEqual([]);
  });

  it("CD: update when displayName differs", async () => {
    const spy: Spy = { calls: [] };
    const r = await upsertCustomDimension(
      fake(spy, "customDimensions"),
      "properties/1",
      { parameterName: "p", displayName: "NEW", scope: "EVENT" },
      { name: "properties/1/customDimensions/9", parameterName: "p", displayName: "OLD", scope: "EVENT" },
    );
    expect(r.action).toBe("update");
    expect(spy.calls).toEqual(["patch"]);
  });

  it("CD: refuses to change parameterName (API_UNSUPPORTED)", async () => {
    const spy: Spy = { calls: [] };
    await expect(
      upsertCustomDimension(
        fake(spy, "customDimensions"),
        "properties/1",
        { parameterName: "new_param", displayName: "X", scope: "EVENT" },
        { name: "x", parameterName: "old_param", displayName: "Y", scope: "EVENT" },
      ),
    ).rejects.toMatchObject({ code: "API_UNSUPPORTED" });
  });

  it("CM and KE: smoke create path", async () => {
    const spy1: Spy = { calls: [] };
    expect((await upsertCustomMetric(fake(spy1, "customMetrics"), "properties/1", { parameterName: "t", displayName: "T", scope: "EVENT", unit: "SECONDS" })).action).toBe("create");
    const spy2: Spy = { calls: [] };
    expect((await upsertKeyEvent(fake(spy2, "keyEvents"), "properties/1", { eventName: "result_view" })).action).toBe("create");
  });

  it("KE: archive remains unsupported", async () => {
    // We don't expose an archive function; verify the module doesn't export one.
    const mod = await import("../src/ga4/keyEvents.js");
    expect("archiveKeyEvent" in mod).toBe(false);
    expect("archiveCustomDimension" in mod).toBe(false);
  });
});
