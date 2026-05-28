import { google } from "googleapis";
import { READ_SCOPES, WRITE_WORKSPACE_SCOPES, PUBLISH_SCOPES } from "./scopes.js";
import { MCPError } from "../utils/errors.js";

export type AuthMode = "read" | "write" | "publish";

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
    : PUBLISH_SCOPES;

  // GoogleAuth picks up GOOGLE_APPLICATION_CREDENTIALS automatically (service account).
  // OAuth refresh-token flow (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN) is supported by
  // googleapis but is not constructed here — wire it explicitly in a later task when a
  // real OAuth call is made.
  return new google.auth.GoogleAuth({ scopes: [...scopes] });
}
