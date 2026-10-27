import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildLoginArgs,
  formatAuthStatus,
  mcpHostConfigSnippet,
  validateClientFile,
} from "../src/auth/setupWizard.js";
import { ALL_LOGIN_SCOPES } from "../src/auth/scopes.js";

const dir = mkdtempSync(join(tmpdir(), "setup-wizard-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function write(name: string, body: unknown): string {
  const p = join(dir, name);
  writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body));
  return p;
}
const REPO = "/nonexistent/repo";
const desktop = { installed: { client_id: "id.apps.googleusercontent.com", client_secret: "s3cret-value" } };

describe("validateClientFile", () => {
  it("accepts a Desktop client JSON outside the repo", () => {
    expect(validateClientFile(write("ok.json", desktop), REPO)).toEqual({ ok: true });
  });

  it("rejects relative paths", () => {
    expect(validateClientFile("client.json", REPO)).toMatchObject({ ok: false, reason: expect.stringContaining("absolute") });
  });

  it("rejects files inside the repository", () => {
    expect(validateClientFile(write("in-repo.json", desktop), dir)).toMatchObject({ ok: false, reason: expect.stringContaining("repository") });
  });

  it("rejects missing files", () => {
    expect(validateClientFile(join(dir, "missing.json"), REPO)).toMatchObject({ ok: false, reason: expect.stringContaining("not found") });
  });

  it("rejects non-JSON files", () => {
    expect(validateClientFile(write("bad.json", "not json"), REPO)).toMatchObject({ ok: false, reason: expect.stringContaining("JSON") });
  });

  it("rejects Web application clients with a Desktop-app hint", () => {
    const r = validateClientFile(write("web.json", { web: { client_id: "a", client_secret: "b" } }), REPO);
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("Desktop app") });
  });

  it("rejects service-account keys", () => {
    const r = validateClientFile(write("sa.json", { type: "service_account", private_key: "k" }), REPO);
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("Desktop app") });
  });

  it("never echoes file contents in the reason", () => {
    const r = validateClientFile(write("leak.json", { installed: { client_id: "id" } }), REPO);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("id.apps");
  });
});

describe("buildLoginArgs", () => {
  it("requests cloud-platform plus the full login scope set with the client file", () => {
    const args = buildLoginArgs("/abs/client.json");
    const scopes = args.find((a) => a.startsWith("--scopes="))!.slice("--scopes=".length).split(",");

    expect(args.slice(0, 3)).toEqual(["auth", "application-default", "login"]);
    expect(args).toContain("--disable-quota-project");
    expect(args).toContain("--client-id-file=/abs/client.json");
    expect(scopes).toEqual(["https://www.googleapis.com/auth/cloud-platform", ...ALL_LOGIN_SCOPES]);
  });
});

describe("formatAuthStatus", () => {
  it("prints a status line per check and the next step for failures", () => {
    const text = formatAuthStatus({
      ready: { read: true, write: false, version: false, publish: false },
      checks: [
        { id: "adc_token", status: "ok", detail: "resolved" },
        { id: "gtm_read", status: "fail", detail: "denied (403)", next_step: "grant a role" },
        { id: "ga4_read", status: "skipped", detail: "no id" },
      ],
    });

    expect(text).toContain("[ok] adc_token");
    expect(text).toContain("[FAIL] gtm_read");
    expect(text).toContain("-> grant a role");
    expect(text).toContain("[skip] ga4_read");
    expect(text).toContain("read=yes write=no");
  });
});

describe("mcpHostConfigSnippet", () => {
  it("emits an mcpServers entry with no env block", () => {
    const parsed = JSON.parse(mcpHostConfigSnippet("/abs/node", "/abs/dist/server.js"));
    expect(parsed).toEqual({
      mcpServers: { "ga4-gtm-config": { command: "/abs/node", args: ["/abs/dist/server.js"] } },
    });
  });
});
