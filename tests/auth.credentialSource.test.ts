import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertRuntimeCredentialSource } from "../src/auth/credentialSource.js";

const tmpDirs: string[] = [];

function writeCredential(body: object): string {
  const dir = mkdtempSync(join(tmpdir(), "ga4-gtm-auth-"));
  tmpDirs.push(dir);
  const path = join(dir, "credentials.json");
  writeFileSync(path, JSON.stringify(body), "utf8");
  return path;
}

describe("assertRuntimeCredentialSource", () => {
  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("allows service account credential JSON", () => {
    const path = writeCredential({
      type: "service_account",
      client_email: "svc@example.iam.gserviceaccount.com",
      private_key: "fake",
    });

    expect(assertRuntimeCredentialSource({ GOOGLE_APPLICATION_CREDENTIALS: path })).toBe("service_account");
  });

  it("allows external account credential JSON for workload identity federation", () => {
    const path = writeCredential({
      type: "external_account",
      audience: "//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/p",
    });

    expect(assertRuntimeCredentialSource({ GOOGLE_APPLICATION_CREDENTIALS: path })).toBe("external_account");
  });

  it("rejects authorized_user ADC credentials", () => {
    const path = writeCredential({
      type: "authorized_user",
      client_id: "fake",
      client_secret: "fake",
      refresh_token: "fake",
    });

    expect(() => assertRuntimeCredentialSource({ GOOGLE_APPLICATION_CREDENTIALS: path })).toThrowError(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );
  });

  it("rejects missing GOOGLE_APPLICATION_CREDENTIALS unless metadata auth is explicitly allowed", () => {
    expect(() => assertRuntimeCredentialSource({})).toThrowError(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );

    expect(assertRuntimeCredentialSource({ ALLOW_GOOGLE_METADATA_AUTH: "1" })).toBe("metadata");
  });
});
