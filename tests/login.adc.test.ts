import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const EXPECTED_OPERATIONAL_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/analytics.edit",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
  "https://www.googleapis.com/auth/tagmanager.publish",
] as const;

type PackageJson = {
  scripts: Record<string, string>;
};

describe("ADC login command", () => {
  it("uses gcloud ADC login with no quota project and the exact independent login scope set", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as PackageJson;
    const command = packageJson.scripts.login;

    expect(command).toBeDefined();
    expect(command).toMatch(/^gcloud auth application-default login /u);
    expect(command).toContain("--disable-quota-project");
    expect(command).not.toContain("--project");
    expect(command).not.toContain("GOOGLE_OAUTH_");

    const scopeArgument = /--scopes=([^\s]+)/u.exec(command ?? "");
    expect(scopeArgument).not.toBeNull();
    const requestedScopes = scopeArgument?.[1]?.split(",") ?? [];
    expect(new Set(requestedScopes)).toEqual(
      new Set([CLOUD_PLATFORM_SCOPE, ...EXPECTED_OPERATIONAL_SCOPES]),
    );
    expect(requestedScopes).toHaveLength(1 + EXPECTED_OPERATIONAL_SCOPES.length);
  });
});
