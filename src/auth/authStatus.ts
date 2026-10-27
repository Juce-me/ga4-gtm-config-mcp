import { isAbsolute } from "node:path";
import { google } from "googleapis";
import { ALL_LOGIN_SCOPES, PUBLISH_SCOPES, READ_SCOPES, VERSION_SCOPES, WRITE_WORKSPACE_SCOPES } from "./scopes.js";
import { buildGa4Admin } from "../ga4/adminClient.js";
import { buildGtm } from "../gtm/tagManagerClient.js";
import { readProperty } from "../ga4/properties.js";
import { listWorkspaces } from "../gtm/workspaces.js";

export interface AuthCheck {
  id: string;
  status: "ok" | "fail" | "skipped";
  detail: string;
  next_step?: string;
}

export interface AuthStatusInput {
  ga4_property_id?: string;
  account_id?: string;
  container_id?: string;
}

export interface AuthStatusDeps {
  env: NodeJS.ProcessEnv;
  /** Resolves ADC and returns the scopes the access token was granted (undefined when unknown). */
  acquireToken(): Promise<{ grantedScopes: string[] | undefined }>;
  probeGa4(propertyId: string): Promise<void>;
  probeGtm(accountId: string, containerId: string): Promise<void>;
}

export interface AuthStatus {
  ready: { read: boolean; write: boolean; version: boolean; publish: boolean };
  checks: AuthCheck[];
}

const LOGIN_STEP = "Run `npm run login` (see docs/setup/user-oauth-login.md), keep it active until browser authorization finishes, then restart the MCP host.";

function httpStatus(e: unknown): number | undefined {
  const err = e as { code?: unknown; response?: { status?: unknown } };
  if (typeof err.response?.status === "number") return err.response.status;
  return typeof err.code === "number" ? err.code : undefined;
}

function probeFailure(product: "GA4" | "GTM", e: unknown): Pick<AuthCheck, "detail" | "next_step"> {
  const status = httpStatus(e);
  if (status === 401) {
    return { detail: `${product} rejected the credentials (401).`, next_step: LOGIN_STEP };
  }
  if (status === 403) {
    return {
      detail: `${product} denied access (403).`,
      next_step: `Grant the ADC identity a ${product} product role on the target resource, confirm the ${product} API is enabled for the credential's project, and confirm the token has the ${product} scopes (see the scopes check).`,
    };
  }
  if (status === 404) {
    return {
      detail: `${product} resource not found (404).`,
      next_step: `Check the ${product} ID in the arguments, or that the ADC identity can see that resource.`,
    };
  }
  return { detail: `${product} read failed${status !== undefined ? ` (${status})` : ""}.`, next_step: "Retry; if it persists, re-run `npm run login`." };
}

export async function checkAuthStatus(input: AuthStatusInput, deps: AuthStatusDeps): Promise<AuthStatus> {
  const checks: AuthCheck[] = [];
  const ready = { read: false, write: false, version: false, publish: false };

  const selector = deps.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (selector !== undefined && (selector.trim() === "" || !isAbsolute(selector))) {
    checks.push({
      id: "adc_selector",
      status: "fail",
      detail: "GOOGLE_APPLICATION_CREDENTIALS is set but blank or not an absolute path.",
      next_step: "Remove it from the MCP host configuration, or set it to the absolute path of a valid ADC credential file.",
    });
    return { ready, checks };
  }
  checks.push({
    id: "adc_selector",
    status: "ok",
    detail: selector === undefined ? "GOOGLE_APPLICATION_CREDENTIALS is unset; standard ADC discovery applies." : "GOOGLE_APPLICATION_CREDENTIALS is an absolute path.",
  });

  let granted: string[] | undefined;
  try {
    ({ grantedScopes: granted } = await deps.acquireToken());
    checks.push({ id: "adc_token", status: "ok", detail: "Application Default Credentials resolved and returned an access token." });
  } catch {
    checks.push({
      id: "adc_token",
      status: "fail",
      detail: "Application Default Credentials are missing, expired, or revoked.",
      next_step: LOGIN_STEP,
    });
    return { ready, checks };
  }

  const has = (required: readonly string[]) => granted === undefined || required.every((s) => granted!.includes(s));
  if (granted === undefined) {
    checks.push({ id: "scopes", status: "skipped", detail: "The token's granted scopes could not be read; scope readiness is unverified." });
  } else {
    const missing = ALL_LOGIN_SCOPES.filter((s) => !granted!.includes(s));
    checks.push(
      missing.length === 0
        ? { id: "scopes", status: "ok", detail: "The token holds the complete login scope set." }
        : {
            id: "scopes",
            status: "fail",
            detail: `The token is missing ${missing.length} login scope(s): ${missing.join(", ")}.`,
            next_step: `${LOGIN_STEP} Service-account ADC requests scopes per mode and may show this as expected.`,
          },
    );
  }
  ready.read = has(READ_SCOPES);
  ready.write = has(WRITE_WORKSPACE_SCOPES);
  ready.version = has(VERSION_SCOPES);
  ready.publish = has(PUBLISH_SCOPES) && deps.env.INCLUDE_PUBLISH_SCOPE === "1";

  checks.push({
    id: "publish_gate",
    status: deps.env.INCLUDE_PUBLISH_SCOPE === "1" ? "ok" : "skipped",
    detail: deps.env.INCLUDE_PUBLISH_SCOPE === "1"
      ? "INCLUDE_PUBLISH_SCOPE=1 is set; publish mode is enabled at the operation gate (other publish guards still apply)."
      : "INCLUDE_PUBLISH_SCOPE is not 1; publish mode is disabled. This is the safe default.",
  });

  if (input.ga4_property_id === undefined) {
    checks.push({ id: "ga4_read", status: "skipped", detail: "Pass ga4_property_id to verify GA4 property access." });
  } else {
    try {
      await deps.probeGa4(input.ga4_property_id);
      checks.push({ id: "ga4_read", status: "ok", detail: "GA4 property is readable." });
    } catch (e) {
      checks.push({ id: "ga4_read", status: "fail", ...probeFailure("GA4", e) });
    }
  }

  if (input.account_id === undefined || input.container_id === undefined) {
    checks.push({ id: "gtm_read", status: "skipped", detail: "Pass account_id and container_id to verify GTM container access." });
  } else {
    try {
      await deps.probeGtm(input.account_id, input.container_id);
      checks.push({ id: "gtm_read", status: "ok", detail: "GTM container is readable." });
    } catch (e) {
      checks.push({ id: "gtm_read", status: "fail", ...probeFailure("GTM", e) });
    }
  }

  return { ready, checks };
}

export function defaultAuthStatusDeps(): AuthStatusDeps {
  return {
    env: process.env,
    async acquireToken() {
      const auth = new google.auth.GoogleAuth({ scopes: [...READ_SCOPES] });
      const client = await auth.getClient();
      const { token } = await client.getAccessToken();
      if (typeof token !== "string" || token.trim() === "") throw new Error("no token");
      try {
        const info = await (client as { getTokenInfo?: (t: string) => Promise<{ scopes?: string[] }> }).getTokenInfo?.(token);
        return { grantedScopes: info?.scopes };
      } catch {
        return { grantedScopes: undefined };
      }
    },
    async probeGa4(propertyId) {
      await readProperty(await buildGa4Admin("read"), propertyId);
    },
    async probeGtm(accountId, containerId) {
      await listWorkspaces(await buildGtm("read"), accountId, containerId);
    },
  };
}
