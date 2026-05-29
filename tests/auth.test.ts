import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildAuth } from "../src/auth/googleAuth.js";
import { READ_SCOPES, WRITE_WORKSPACE_SCOPES, VERSION_SCOPES, PUBLISH_SCOPES } from "../src/auth/scopes.js";

describe("auth scopes", () => {
  it("READ_SCOPES contains tag manager + analytics read", () => {
    expect(READ_SCOPES).toContain("https://www.googleapis.com/auth/tagmanager.readonly");
    expect(READ_SCOPES).toContain("https://www.googleapis.com/auth/analytics.readonly");
  });

  it("WRITE_WORKSPACE_SCOPES is a superset of READ_SCOPES + adds edit scopes", () => {
    for (const s of READ_SCOPES) expect(WRITE_WORKSPACE_SCOPES).toContain(s);
    expect(WRITE_WORKSPACE_SCOPES).toContain("https://www.googleapis.com/auth/tagmanager.edit.containers");
    expect(WRITE_WORKSPACE_SCOPES).toContain("https://www.googleapis.com/auth/analytics.edit");
    expect(WRITE_WORKSPACE_SCOPES).not.toContain("https://www.googleapis.com/auth/tagmanager.edit.containerversions");
  });

  it("VERSION_SCOPES is a superset of READ_SCOPES + adds container-version edit only", () => {
    for (const s of READ_SCOPES) expect(VERSION_SCOPES).toContain(s);
    expect(VERSION_SCOPES).toContain("https://www.googleapis.com/auth/tagmanager.edit.containerversions");
    expect(VERSION_SCOPES).not.toContain("https://www.googleapis.com/auth/tagmanager.edit.containers");
    expect(VERSION_SCOPES).not.toContain("https://www.googleapis.com/auth/tagmanager.publish");
  });

  it("PUBLISH_SCOPES is a superset of WRITE_WORKSPACE_SCOPES + adds publish scope", () => {
    for (const s of WRITE_WORKSPACE_SCOPES) expect(PUBLISH_SCOPES).toContain(s);
    expect(PUBLISH_SCOPES).toContain("https://www.googleapis.com/auth/tagmanager.publish");
  });
});

describe("buildAuth", () => {
  beforeEach(() => { vi.unstubAllEnvs(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("returns an auth object for read mode", async () => {
    const auth = await buildAuth({ mode: "read" });
    expect(auth).toBeDefined();
  });

  it("returns an auth object for write mode", async () => {
    const auth = await buildAuth({ mode: "write" });
    expect(auth).toBeDefined();
  });

  it("returns an auth object for version mode without publish opt-in", async () => {
    vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "");
    const auth = await buildAuth({ mode: "version" });
    expect(auth).toBeDefined();
  });

  it("refuses publish mode unless INCLUDE_PUBLISH_SCOPE=1", async () => {
    vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "");
    await expect(buildAuth({ mode: "publish" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("allows publish mode when INCLUDE_PUBLISH_SCOPE=1", async () => {
    vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "1");
    const auth = await buildAuth({ mode: "publish" });
    expect(auth).toBeDefined();
  });
});
