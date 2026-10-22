import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { ALL_LOGIN_SCOPES } from "./scopes.js";
import type { AuthStatus } from "./authStatus.js";

export type ClientFileCheck = { ok: true } | { ok: false; reason: string };

const DESKTOP_HINT = 'In Google Auth Platform > Clients, create a client of type "Desktop app" and download its JSON.';

// Validates shape only. Reasons never include file contents because the file holds a client secret.
export function validateClientFile(path: string, repoRoot: string): ClientFileCheck {
  if (!isAbsolute(path)) return { ok: false, reason: "Use an absolute path to the client JSON." };
  const rel = relative(repoRoot, path);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return { ok: false, reason: "The client JSON is inside this repository. Move it outside every repository first." };
  }
  if (!existsSync(path)) return { ok: false, reason: "File not found at that path." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { ok: false, reason: "The file is not valid JSON." };
  }
  const installed = (parsed as { installed?: { client_id?: unknown; client_secret?: unknown } } | null)?.installed;
  if (typeof installed?.client_id !== "string" || typeof installed.client_secret !== "string") {
    return { ok: false, reason: `This is not a Desktop app client JSON (expected an "installed" client). ${DESKTOP_HINT}` };
  }
  return { ok: true };
}

export function buildLoginArgs(clientFile: string): string[] {
  return [
    "auth",
    "application-default",
    "login",
    "--disable-quota-project",
    `--scopes=${["https://www.googleapis.com/auth/cloud-platform", ...ALL_LOGIN_SCOPES].join(",")}`,
    `--client-id-file=${clientFile}`,
  ];
}

export function formatAuthStatus(status: AuthStatus): string {
  const label = { ok: "[ok]", fail: "[FAIL]", skipped: "[skip]" } as const;
  const lines = status.checks.flatMap((c) => [
    `${label[c.status]} ${c.id}: ${c.detail}`,
    ...(c.next_step ? [`       -> ${c.next_step}`] : []),
  ]);
  const yn = (b: boolean) => (b ? "yes" : "no");
  const r = status.ready;
  lines.push(`Ready modes: read=${yn(r.read)} write=${yn(r.write)} version=${yn(r.version)} publish=${yn(r.publish)}`);
  return lines.join("\n");
}

export function mcpHostConfigSnippet(nodePath: string, serverPath: string): string {
  return JSON.stringify({ mcpServers: { "ga4-gtm-config": { command: nodePath, args: [serverPath] } } }, null, 2);
}

export const AUDIENCE_GUIDANCE = [
  "Before signing in, check the OAuth audience of the project that owns your client",
  "(Google Auth Platform > Audience):",
  "  - Internal (Workspace orgs): no test-user list, no weekly re-login. Preferred when available.",
  "  - External + Testing: add the Google account you will sign in with under Test users.",
  '    Expect an "unverified app" warning (continue past it) and a re-login about every 7 days.',
].join("\n");

export const BLOCKED_HINT = [
  'If the browser showed "This app is blocked" or "Access blocked":',
  "  - The client must be your own Desktop app client, not gcloud's built-in one.",
  "  - With External + Testing, add your account under Audience > Test users, then rerun `npm run setup`.",
  "  - Confirm the Google Analytics Admin API and Tag Manager API are enabled in the client's project.",
].join("\n");
