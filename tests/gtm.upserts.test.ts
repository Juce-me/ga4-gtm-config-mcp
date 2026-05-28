import { describe, it, expect } from "vitest";
import { upsertVariable } from "../src/gtm/variables.js";
import { upsertTrigger } from "../src/gtm/triggers.js";
import { upsertTag } from "../src/gtm/tags.js";

type Spy = { calls: string[] };

function fakeGtm(spy: Spy, kind: "variables" | "triggers" | "tags") {
  return {
    accounts: { containers: { workspaces: {
      [kind]: {
        create: async (args: unknown) => { spy.calls.push("create"); return { data: { name: "created", ...(args as { requestBody: object }).requestBody } }; },
        update: async (args: unknown) => { spy.calls.push("update"); return { data: { name: "updated", ...(args as { requestBody: object }).requestBody } }; },
      },
    } } },
  } as unknown as Parameters<typeof upsertVariable>[0];
}

describe("gtm upsert helpers", () => {
  const wsRef = "accounts/1/containers/2/workspaces/3";

  it("variable: create when existing is undefined", async () => {
    const spy: Spy = { calls: [] };
    const gtm = fakeGtm(spy, "variables");
    const r = await upsertVariable(gtm, wsRef, { name: "v", type: "v", parameter: [] });
    expect(r.action).toBe("create");
    expect(spy.calls).toEqual(["create"]);
  });

  it("variable: unchanged when payload matches existing comparable fields", async () => {
    const spy: Spy = { calls: [] };
    const gtm = fakeGtm(spy, "variables");
    const r = await upsertVariable(gtm, wsRef, { name: "v", type: "v", parameter: [] }, { name: "v", type: "v", parameter: [], fingerprint: "abc", accountId: "1", path: "accounts/1/containers/2/workspaces/3/variables/9" });
    expect(r.action).toBe("unchanged");
    expect(spy.calls).toEqual([]); // no API call
  });

  it("variable: update when comparable fields differ", async () => {
    const spy: Spy = { calls: [] };
    const gtm = fakeGtm(spy, "variables");
    const r = await upsertVariable(gtm, wsRef, { name: "v", type: "v", parameter: [{ type: "template", key: "x", value: "new" }] }, { name: "v", type: "v", parameter: [{ type: "template", key: "x", value: "old" }], path: "accounts/1/containers/2/workspaces/3/variables/9" });
    expect(r.action).toBe("update");
    expect(spy.calls).toEqual(["update"]);
  });

  it("trigger: same three paths", async () => {
    const spy: Spy = { calls: [] };
    const gtm = fakeGtm(spy, "triggers");
    expect((await upsertTrigger(gtm, wsRef, { name: "t", type: "customEvent", customEventFilter: [] })).action).toBe("create");
  });

  it("tag: same three paths", async () => {
    const spy: Spy = { calls: [] };
    const gtm = fakeGtm(spy, "tags");
    expect((await upsertTag(gtm, wsRef, { name: "tg", type: "ga4_event", parameter: [], firingTriggerId: ["1"] })).action).toBe("create");
  });
});
