import { google } from "googleapis";
import { loadUserOAuth } from "./userOAuth.js";
import {
  READ_SCOPES,
  WRITE_WORKSPACE_SCOPES,
  VERSION_SCOPES,
  PUBLISH_SCOPES,
} from "./scopes.js";
import { MCPError } from "../utils/errors.js";

export type AuthMode = "read" | "write" | "version" | "publish";

function requiredScopes(mode: AuthMode): readonly string[] {
  if (mode === "read") return READ_SCOPES;
  if (mode === "write") return WRITE_WORKSPACE_SCOPES;
  if (mode === "version") return VERSION_SCOPES;
  return PUBLISH_SCOPES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInvalidGrant(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error.code === "invalid_grant") return true;
  if (!isRecord(error.response) || !isRecord(error.response.data)) return false;
  return error.response.data.error === "invalid_grant";
}

export async function buildAuth(
  opts: { mode: AuthMode },
): Promise<InstanceType<typeof google.auth.OAuth2>> {
  if (opts.mode === "publish" && process.env.INCLUDE_PUBLISH_SCOPE !== "1") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Publish mode requires INCLUDE_PUBLISH_SCOPE=1.",
    );
  }

  const { auth, token } = loadUserOAuth();
  const grantedScopes = new Set(token.granted_scopes);
  if (requiredScopes(opts.mode).some((scope) => !grantedScopes.has(scope))) {
    throw new MCPError(
      "PERMISSION_DENIED",
      `Stored Google OAuth grant does not cover ${opts.mode} mode. Run npm run login.`,
      { reason: "missing_required_scopes" },
    );
  }

  try {
    await auth.getAccessToken();
  } catch (error) {
    if (isInvalidGrant(error)) {
      throw new MCPError(
        "PERMISSION_DENIED",
        "Google OAuth authorization expired or was revoked. Run npm run login.",
      );
    }
    throw new MCPError(
      "PERMISSION_DENIED",
      "Google OAuth token refresh failed. Run npm run login.",
      { reason: "oauth_refresh_failed" },
    );
  }

  return auth;
}
