import { readFileSync } from "node:fs";
import { MCPError } from "../utils/errors.js";

export type RuntimeCredentialSource = "service_account" | "external_account" | "impersonated_adc" | "metadata";

type CredentialJson = {
  type?: unknown;
  service_account_impersonation_url?: unknown;
  source_credentials?: unknown;
  endpoint?: unknown;
  universe_domain?: unknown;
  universeDomain?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertDefaultUniverseDomain(value: Record<string, unknown>, fieldName: "universe_domain" | "universeDomain", path: string): void {
  if (Object.hasOwn(value, fieldName) && value[fieldName] !== "googleapis.com") {
    throw new MCPError("PERMISSION_DENIED", `Impersonated ADC ${path}.${fieldName} must be googleapis.com.`);
  }
}

function assertValidImpersonatedAdc(parsed: CredentialJson): void {
  if (typeof parsed.service_account_impersonation_url !== "string") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Impersonated ADC requires a string service_account_impersonation_url.",
    );
  }
  if (!isObject(parsed.source_credentials)) {
    throw new MCPError("PERMISSION_DENIED", "Impersonated ADC requires object source_credentials.");
  }
  if (parsed.source_credentials.type !== "authorized_user") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Impersonated ADC requires source_credentials.type to be authorized_user.",
    );
  }
  if (Object.hasOwn(parsed, "endpoint")) {
    throw new MCPError("PERMISSION_DENIED", "Impersonated ADC must not define a top-level endpoint override.");
  }
  assertDefaultUniverseDomain(parsed as Record<string, unknown>, "universe_domain", "credential");
  assertDefaultUniverseDomain(parsed as Record<string, unknown>, "universeDomain", "credential");
  assertDefaultUniverseDomain(parsed.source_credentials, "universe_domain", "source_credentials");
  assertDefaultUniverseDomain(parsed.source_credentials, "universeDomain", "source_credentials");

  let impersonationUrl: URL;
  try {
    impersonationUrl = new URL(parsed.service_account_impersonation_url);
  } catch {
    throw new MCPError("PERMISSION_DENIED", "Impersonated ADC requires a valid service_account_impersonation_url.");
  }

  if (impersonationUrl.protocol !== "https:") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Impersonated ADC service_account_impersonation_url must use https.",
    );
  }
  if (impersonationUrl.host !== "iamcredentials.googleapis.com") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Impersonated ADC service_account_impersonation_url must use iamcredentials.googleapis.com.",
    );
  }
  if (!/^\/v1\/projects\/-\/serviceAccounts\/[^/]+:generateAccessToken$/.test(impersonationUrl.pathname)) {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Impersonated ADC service_account_impersonation_url must match /v1/projects/-/serviceAccounts/<target>:generateAccessToken.",
    );
  }
  if (impersonationUrl.search !== "") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Impersonated ADC service_account_impersonation_url must not include a query string.",
    );
  }
  if (impersonationUrl.hash !== "") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Impersonated ADC service_account_impersonation_url must not include a fragment.",
    );
  }
}

export function assertRuntimeCredentialSource(env: NodeJS.ProcessEnv = process.env): RuntimeCredentialSource {
  const credentialsPath = env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    if (env.ALLOW_GOOGLE_METADATA_AUTH === "1") return "metadata";
    throw new MCPError(
      "PERMISSION_DENIED",
      "Runtime auth requires GOOGLE_APPLICATION_CREDENTIALS unless ALLOW_GOOGLE_METADATA_AUTH=1 is explicitly set.",
    );
  }

  let parsed: CredentialJson;
  try {
    parsed = JSON.parse(readFileSync(credentialsPath, "utf8")) as CredentialJson;
  } catch (e) {
    throw new MCPError("PERMISSION_DENIED", "Could not read runtime credential source.", {
      reason: e instanceof SyntaxError ? "invalid_json" : "unreadable",
    });
  }

  if (parsed.type === "service_account") return "service_account";
  if (parsed.type === "external_account") return "external_account";

  if (parsed.type === "impersonated_service_account") {
    if (env.ALLOW_GOOGLE_IMPERSONATED_ADC !== "1") {
      throw new MCPError(
        "PERMISSION_DENIED",
        "MCP runtime refuses impersonated ADC credentials unless ALLOW_GOOGLE_IMPERSONATED_ADC=1 is explicitly set.",
      );
    }
    assertValidImpersonatedAdc(parsed);
    return "impersonated_adc";
  }

  if (parsed.type === "authorized_user") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "MCP runtime refuses plain authorized_user ADC credentials. Bootstrap access separately, then run with service-account, external-account, or explicitly allowed impersonated ADC credentials.",
    );
  }

  throw new MCPError("PERMISSION_DENIED", "Unsupported runtime credential source.", {
    credentialType: typeof parsed.type === "string" ? parsed.type : "missing",
  });
}
