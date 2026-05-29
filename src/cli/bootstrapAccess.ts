import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { google } from "googleapis";
import { ensureGa4AccessBinding, ensureGtmUserPermission } from "../bootstrap/accessBootstrap.js";
import { redact } from "../utils/redact.js";

export type BootstrapAccessArgs = {
  serviceAccountEmail: string;
  ga4Property?: string;
  gtmAccount?: string;
  gtmContainer?: string;
  dryRun: boolean;
  skipGa4: boolean;
  skipGtm: boolean;
};

type BootstrapClients = {
  ga4: Parameters<typeof ensureGa4AccessBinding>[0];
  gtm: Parameters<typeof ensureGtmUserPermission>[0];
};

export type BootstrapAccessResult = {
  dryRun: boolean;
  ga4?: Awaited<ReturnType<typeof ensureGa4AccessBinding>>;
  gtm?: Awaited<ReturnType<typeof ensureGtmUserPermission>>;
};

type RunBootstrapAccessOptions = {
  args: BootstrapAccessArgs;
  readAccessToken?: () => Promise<string>;
  makeClients?: (accessToken: string) => BootstrapClients;
  ensureGa4?: typeof ensureGa4AccessBinding;
  ensureGtm?: typeof ensureGtmUserPermission;
};

export function parseBootstrapAccessArgs(argv: string[]): BootstrapAccessArgs {
  const values = new Map<string, string | true>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);

    if (arg === "--apply" || arg === "--dry-run" || arg === "--skip-ga4" || arg === "--skip-gtm") {
      values.set(arg, true);
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    values.set(arg, value);
    i++;
  }

  const serviceAccountEmail = values.get("--service-account-email");
  if (typeof serviceAccountEmail !== "string") throw new Error("Missing --service-account-email");

  const skipGa4 = values.get("--skip-ga4") === true;
  const skipGtm = values.get("--skip-gtm") === true;
  if (values.get("--dry-run") === true && values.get("--apply") === true) {
    throw new Error("Choose either --dry-run or --apply");
  }

  const ga4Property = values.get("--ga4-property");
  const gtmAccount = values.get("--gtm-account");
  const gtmContainer = values.get("--gtm-container");

  if (!skipGa4 && typeof ga4Property !== "string") {
    throw new Error("Provide --ga4-property or --skip-ga4");
  }
  if (!skipGtm && (typeof gtmAccount !== "string" || typeof gtmContainer !== "string")) {
    throw new Error("Provide --gtm-account and --gtm-container or --skip-gtm");
  }

  return {
    serviceAccountEmail,
    ga4Property: typeof ga4Property === "string" ? ga4Property : undefined,
    gtmAccount: typeof gtmAccount === "string" ? gtmAccount : undefined,
    gtmContainer: typeof gtmContainer === "string" ? gtmContainer : undefined,
    dryRun: values.get("--apply") !== true,
    skipGa4,
    skipGtm,
  };
}

export async function runBootstrapAccess(opts: RunBootstrapAccessOptions): Promise<BootstrapAccessResult> {
  const accessToken = (await (opts.readAccessToken ?? readBootstrapAccessToken)()).trim();
  if (!accessToken) throw new Error("Missing bootstrap access token");

  const clients = (opts.makeClients ?? makeBootstrapClients)(accessToken);
  const ensureGa4 = opts.ensureGa4 ?? ensureGa4AccessBinding;
  const ensureGtm = opts.ensureGtm ?? ensureGtmUserPermission;
  const result: BootstrapAccessResult = { dryRun: opts.args.dryRun };

  if (!opts.args.skipGa4) {
    if (!opts.args.ga4Property) throw new Error("Provide --ga4-property or --skip-ga4");
    result.ga4 = await ensureGa4(clients.ga4, {
      propertyId: opts.args.ga4Property,
      serviceAccountEmail: opts.args.serviceAccountEmail,
      dryRun: opts.args.dryRun,
    });
  }

  if (!opts.args.skipGtm) {
    if (!opts.args.gtmAccount || !opts.args.gtmContainer) {
      throw new Error("Provide --gtm-account and --gtm-container or --skip-gtm");
    }
    result.gtm = await ensureGtm(clients.gtm, {
      accountId: opts.args.gtmAccount,
      containerId: opts.args.gtmContainer,
      emailAddress: opts.args.serviceAccountEmail,
      dryRun: opts.args.dryRun,
    });
  }

  return result;
}

function makeBootstrapClients(accessToken: string): BootstrapClients {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return {
    ga4: google.analyticsadmin({ version: "v1alpha", auth }),
    gtm: google.tagmanager({ version: "v2", auth }),
  };
}

async function readBootstrapAccessToken(): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return await rl.question("Paste one-time admin OAuth access token: ");
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = parseBootstrapAccessArgs(process.argv.slice(2));
  const result = await runBootstrapAccess({ args });
  output.write(`${JSON.stringify(redact(result), null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  });
}
