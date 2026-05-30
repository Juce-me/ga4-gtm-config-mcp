import { readFileSync } from "node:fs";
import { MCPError } from "../utils/errors.js";

export type RuntimeCredentialSource = "service_account" | "external_account" | "metadata";

type CredentialJson = {
  type?: unknown;
};

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
    throw new MCPError("PERMISSION_DENIED", "Could not read runtime credential source.", { cause: String(e) });
  }

  if (parsed.type === "service_account") return "service_account";
  if (parsed.type === "external_account") return "external_account";

  if (parsed.type === "authorized_user") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "MCP runtime refuses authorized_user ADC credentials. Bootstrap access separately, then run with service-account or external-account credentials.",
    );
  }

  throw new MCPError("PERMISSION_DENIED", "Unsupported runtime credential source.", {
    credentialType: typeof parsed.type === "string" ? parsed.type : "missing",
  });
}
