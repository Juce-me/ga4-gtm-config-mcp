import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkAuthStatus, defaultAuthStatusDeps } from "./authStatus.js";
import {
  AUDIENCE_GUIDANCE,
  BLOCKED_HINT,
  buildLoginArgs,
  formatAuthStatus,
  mcpHostConfigSnippet,
  validateClientFile,
} from "./setupWizard.js";

const out = (s: string) => process.stdout.write(`${s}\n`);

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<number> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string) => (await rl.question(q)).trim();

  try {
    out("Step 1/5: gcloud CLI");
    if (spawnSync("gcloud", ["--version"], { stdio: "ignore" }).status !== 0) {
      out("gcloud was not found. Install it from https://cloud.google.com/sdk/docs/install, then rerun `npm run setup`.");
      return 1;
    }
    out("  gcloud found.\n");

    out("Step 2/5: Desktop OAuth client");
    out("  Google blocks gcloud's built-in client for Analytics scopes, so you need your own Desktop app client:");
    out("  1. Enable the Google Analytics Admin API and Tag Manager API in a Google Cloud project.");
    out('  2. Google Auth Platform > Clients > Create client > "Desktop app"; download the JSON outside every repository.');
    out(`  ${AUDIENCE_GUIDANCE.split("\n").join("\n  ")}\n`);
    let clientFile = flag("client-id-file");
    for (;;) {
      clientFile ??= await ask("Absolute path to the client JSON: ");
      const check = validateClientFile(clientFile, process.cwd());
      if (check.ok) break;
      out(`  ${check.reason}`);
      if (flag("client-id-file") !== undefined) return 1;
      clientFile = undefined;
    }
    out("  Client JSON looks valid (contents not displayed).\n");

    out("Step 3/5: Browser sign-in");
    out("  gcloud opens your browser. Sign in as the account that holds your GA4/GTM roles, approve every scope,");
    out("  and keep this terminal open until it reports success.\n");
    const code = await new Promise<number>((resolve) => {
      spawn("gcloud", buildLoginArgs(clientFile!), { stdio: "inherit" }).on("close", (c) => resolve(c ?? 1));
    });
    if (code !== 0) {
      out(`\nLogin failed (gcloud exit ${code}).\n${BLOCKED_HINT}`);
      return 1;
    }

    out("\nStep 4/5: Verify access");
    const ga4 = flag("ga4-property-id") ?? (await ask("GA4 property ID to test (Enter to skip): "));
    const accountId = flag("account-id") ?? (await ask("GTM account ID to test (Enter to skip): "));
    const containerId = accountId ? flag("container-id") ?? (await ask("GTM container ID: ")) : "";
    const status = await checkAuthStatus(
      {
        ...(ga4 ? { ga4_property_id: ga4 } : {}),
        ...(accountId && containerId ? { account_id: accountId, container_id: containerId } : {}),
      },
      defaultAuthStatusDeps(),
    );
    out(formatAuthStatus(status));
    const failed = status.checks.some((c) => c.status === "fail");

    out("\nStep 5/5: MCP host configuration");
    out("  Build the server (`npm run build`), then add this entry to your MCP host and restart it.");
    out("  Leave out any env block so well-known ADC is used. After restart, call the check_auth_status tool.\n");
    const serverPath = join(dirname(fileURLToPath(import.meta.url)), "..", "server.js");
    out(mcpHostConfigSnippet(process.execPath, serverPath));
    return failed ? 1 : 0;
  } finally {
    rl.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
