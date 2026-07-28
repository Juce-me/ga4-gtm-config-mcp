import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildAuth } from "../src/auth/googleAuth.js";
import {
  READ_SCOPES,
  WRITE_WORKSPACE_SCOPES,
  VERSION_SCOPES,
  PUBLISH_SCOPES,
} from "../src/auth/scopes.js";
import * as scopes from "../src/auth/scopes.js";

const tmpDirs: string[] = [];

function writeCredential(body: object): string {
  const dir = mkdtempSync(join(tmpdir(), "ga4-gtm-auth-"));
  tmpDirs.push(dir);
  const path = join(dir, "credentials.json");
  writeFileSync(path, JSON.stringify(body), "utf8");
  return path;
}

function impersonatedAdc(): object {
  return {
    type: "impersonated_service_account",
    source_credentials: {
      type: "authorized_user",
      client_id: "fake",
      client_secret: "fake",
      refresh_token: "fake",
    },
    service_account_impersonation_url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/service@example.iam.gserviceaccount.com:generateAccessToken",
    delegates: [],
    scopes: ["https://www.googleapis.com/auth/tagmanager.readonly"],
  };
}

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

  it("ALL_LOGIN_SCOPES combines every operational scope without user-management grants", () => {
    const allLoginScopes = (scopes as Record<string, readonly string[]>).ALL_LOGIN_SCOPES ?? [];

    for (const scopeSet of [READ_SCOPES, WRITE_WORKSPACE_SCOPES, VERSION_SCOPES, PUBLISH_SCOPES]) {
      for (const scope of scopeSet) expect(allLoginScopes).toContain(scope);
    }

    expect(new Set(allLoginScopes).size).toBe(allLoginScopes.length);
    expect(allLoginScopes).not.toContain("https://www.googleapis.com/auth/analytics.manage.users");
    expect(allLoginScopes).not.toContain("https://www.googleapis.com/auth/tagmanager.manage.users");
  });
});

describe("buildAuth", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ALLOW_GOOGLE_METADATA_AUTH", "1");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("returns an auth object for read mode", async () => {
    const auth = await buildAuth({ mode: "read" });
    expect(auth).toBeDefined();
  });

  it("uses an explicit metadata Compute client when metadata auth is allowed", async () => {
    vi.stubEnv("ALLOW_GOOGLE_METADATA_AUTH", "1");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "");

    const auth = await buildAuth({ mode: "read" });
    expect(auth.constructor.name).toBe("Compute");
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

  it("rejects user ADC credentials at runtime", async () => {
    vi.stubEnv("ALLOW_GOOGLE_METADATA_AUTH", "");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", writeCredential({
      type: "authorized_user",
      client_id: "fake",
      client_secret: "fake",
      refresh_token: "fake",
    }));

    await expect(buildAuth({ mode: "read" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("accepts impersonated ADC credentials when explicitly allowed", async () => {
    vi.stubEnv("ALLOW_GOOGLE_METADATA_AUTH", "");
    vi.stubEnv("ALLOW_GOOGLE_IMPERSONATED_ADC", "1");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", writeCredential(impersonatedAdc()));

    const auth = await buildAuth({ mode: "read" });
    expect(auth.constructor.name).toBe("GoogleAuth");
  });

  it("rejects plain user ADC credentials even when impersonated ADC is allowed", async () => {
    vi.stubEnv("ALLOW_GOOGLE_METADATA_AUTH", "");
    vi.stubEnv("ALLOW_GOOGLE_IMPERSONATED_ADC", "1");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", writeCredential({
      type: "authorized_user",
      client_id: "fake",
      client_secret: "fake",
      refresh_token: "fake",
    }));

    await expect(buildAuth({ mode: "read" })).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: expect.stringContaining("plain authorized_user ADC"),
    });
  });
});
