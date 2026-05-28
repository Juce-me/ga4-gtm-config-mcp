import { describe, it, expect } from "vitest";
import { workspaceCapacity, findByName, listWorkspaces } from "../src/gtm/workspaces.js";

function fakeGtm(workspaces: Array<{ workspaceId: string; name: string }>) {
  return {
    accounts: {
      containers: {
        workspaces: {
          list: async () => ({ data: { workspace: workspaces } }),
        },
      },
    },
  } as unknown as Parameters<typeof listWorkspaces>[0];
}

describe("gtm.workspaces.workspaceCapacity", () => {
  it("reports free slots and capacityOk=true under cap", async () => {
    const gtm = fakeGtm([{ workspaceId: "1", name: "a" }, { workspaceId: "2", name: "b" }]);
    const cap = await workspaceCapacity(gtm, "1234", "5678");
    expect(cap.existing).toBe(2);
    expect(cap.max).toBe(3);
    expect(cap.freeSlots).toBe(1);
    expect(cap.capacityOk).toBe(true);
  });

  it("reports capacityOk=false at cap", async () => {
    const gtm = fakeGtm([
      { workspaceId: "1", name: "a" },
      { workspaceId: "2", name: "b" },
      { workspaceId: "3", name: "c" },
    ]);
    const cap = await workspaceCapacity(gtm, "1234", "5678");
    expect(cap.freeSlots).toBe(0);
    expect(cap.capacityOk).toBe(false);
  });
});

describe("gtm.workspaces.findByName", () => {
  it("returns the matching workspace", async () => {
    const gtm = fakeGtm([
      { workspaceId: "1", name: "ga4-instrumentation-2026-05-28" },
      { workspaceId: "2", name: "other" },
    ]);
    const ws = await findByName(gtm, "1234", "5678", "other");
    expect(ws?.workspaceId).toBe("2");
  });

  it("returns undefined when not found", async () => {
    const gtm = fakeGtm([{ workspaceId: "1", name: "a" }]);
    const ws = await findByName(gtm, "1234", "5678", "missing");
    expect(ws).toBeUndefined();
  });
});
