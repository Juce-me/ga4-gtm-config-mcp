import { google } from "googleapis";
import { READ_SCOPES, WRITE_WORKSPACE_SCOPES, VERSION_SCOPES, PUBLISH_SCOPES } from "./scopes.js";
import { assertRuntimeCredentialSource } from "./credentialSource.js";
import { MCPError } from "../utils/errors.js";

export type AuthMode = "read" | "write" | "version" | "publish";

export async function buildAuth(opts: { mode: AuthMode }) {
  if (opts.mode === "publish" && process.env.INCLUDE_PUBLISH_SCOPE !== "1") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Publish scope requires INCLUDE_PUBLISH_SCOPE=1 in env to be opt-in.",
    );
  }
  const scopes =
    opts.mode === "read" ? READ_SCOPES
    : opts.mode === "write" ? WRITE_WORKSPACE_SCOPES
    : opts.mode === "version" ? VERSION_SCOPES
    : PUBLISH_SCOPES;

  const credentialSource = assertRuntimeCredentialSource();
  if (credentialSource === "metadata") {
    return new google.auth.Compute({ scopes: [...scopes] });
  }

  // GoogleAuth picks up GOOGLE_APPLICATION_CREDENTIALS automatically (service account).
  return new google.auth.GoogleAuth({ scopes: [...scopes] });
}
