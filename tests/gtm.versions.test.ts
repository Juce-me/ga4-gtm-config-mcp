import { describe, it, expect } from "vitest";
import { createVersion } from "../src/gtm/versions.js";

describe("gtm.versions.createVersion", () => {
  it("throws MCPError(WORKSPACE_UNSAFE) on the live workspace", async () => {
    const fakeGtm = {
      accounts: { containers: { workspaces: { create_version: async () => ({ data: {} }) } } },
    } as unknown as Parameters<typeof createVersion>[0];

    await expect(
      createVersion(fakeGtm, "123", "456", "0", "v1", "notes"),
    ).rejects.toMatchObject({ code: "WORKSPACE_UNSAFE" });
  });

  it("passes through to the API on a non-live workspace", async () => {
    let called = false;
    const fakeGtm = {
      accounts: {
        containers: {
          workspaces: {
            create_version: async () => {
              called = true;
              return { data: { containerVersion: { name: "v42" } } };
            },
          },
        },
      },
    } as unknown as Parameters<typeof createVersion>[0];

    const r = await createVersion(fakeGtm, "123", "456", "7", "v42", "notes");
    expect(called).toBe(true);
    expect((r as { containerVersion: { name: string } }).containerVersion.name).toBe("v42");
  });
});
