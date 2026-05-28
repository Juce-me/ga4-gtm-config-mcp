import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { publishVersion } from "../src/gtm/publish.js";

describe("gtm.publish.publishVersion", () => {
  beforeEach(() => { vi.unstubAllEnvs(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("refuses without INCLUDE_PUBLISH_SCOPE=1 and never touches the API", async () => {
    vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "");
    let called = false;
    const fakeGtm = {
      accounts: { containers: { versions: { publish: async () => { called = true; return { data: {} }; } } } },
    } as unknown as Parameters<typeof publishVersion>[0];

    await expect(publishVersion(fakeGtm, "1", "2", "99")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(called).toBe(false);
  });

  it("calls the API when INCLUDE_PUBLISH_SCOPE=1", async () => {
    vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "1");
    let called = false;
    const fakeGtm = {
      accounts: { containers: { versions: { publish: async () => { called = true; return { data: { containerVersion: { name: "v42" } } }; } } } },
    } as unknown as Parameters<typeof publishVersion>[0];

    const r = await publishVersion(fakeGtm, "1", "2", "99");
    expect(called).toBe(true);
    expect((r as { containerVersion: { name: string } }).containerVersion.name).toBe("v42");
  });
});
